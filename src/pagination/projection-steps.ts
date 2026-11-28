// Steps carried between the paged projection and the canonical whole document. A text replacement
// or a mark maps each end of its range, so footnote entries and repeated header rows are found
// again; other steps map through the page transform alone. Two edits need more than one step on
// the projection: a canonical replacement whose range crosses a page break is mirrored page by
// page, as one step there would join the pages and drop the footnotes, header and footer between
// them; and an edit to a header row a split table repeats is made on every copy.

import { type Node as ProseMirrorNode, Slice } from 'prosemirror-model';
import {
  AddMarkStep,
  type Mapping,
  RemoveMarkStep,
  ReplaceStep,
  type Step,
} from 'prosemirror-transform';
import { splitPartOf } from '../model/pagination/split-part.js';
import { isTableHeaderCopy } from '../model/pagination/table-header-copies.js';
import { leadingHeaderRows, projectedHeaderRows } from '../model/pagination/table-headers.js';
import { footnoteAt, footnoteCopies } from './footnote-positions.js';
import type { MapDirection } from './page-positions.js';
import type { Mirrored, ProjectionMap } from './projection-map.js';

/** How `mapStepRange` places a step's ends. */
interface StepPlacement {
  readonly direction: MapDirection;
  readonly map: (pos: number, assoc: -1 | 1) => number | null;
  /** The side an empty range at `pos` keeps to in the projection. */
  readonly side: (pos: number) => -1 | 1;
  /** The mapping a step of another kind maps through. */
  readonly through: Mapping;
}

type RangeStep = ReplaceStep | AddMarkStep | RemoveMarkStep;

const isRangeStep = (step: Step): step is RangeStep =>
  step instanceof ReplaceStep || step instanceof AddMarkStep || step instanceof RemoveMarkStep;

// The fields a replace step keeps to itself.
const replaceParts = (step: ReplaceStep) =>
  step as unknown as { readonly slice: Slice; readonly structure: boolean };

// The step with its range moved to `from`..`to`.
function placed(step: RangeStep, from: number, to: number): Step {
  if (step instanceof ReplaceStep) {
    const { slice, structure } = replaceParts(step);
    return new ReplaceStep(from, to, slice, structure);
  }
  if (step instanceof AddMarkStep) return new AddMarkStep(from, to, step.mark);
  return new RemoveMarkStep(from, to, step.mark);
}

/** A step on one document as the same edit on the other; null when it cannot be placed. */
export function mapStepRange(step: Step, placement: StepPlacement): Step | null {
  if (!isRangeStep(step)) return step.map(placement.through);
  const empty = step.from === step.to;
  const fromSide = empty && placement.direction === 'toCanonical' ? placement.side(step.from) : 1;
  const from = placement.map(step.from, fromSide);
  const to = empty ? from : placement.map(step.to, -1);
  if (from === null || to === null) return null;
  return placed(step, from, Math.max(from, to));
}

interface Piece {
  readonly from: number;
  readonly to: number;
}

// A replacement inside one canonical textblock whose range crosses a page break in the
// projection: the projection ranges of its text on each side, in order; null for any other step.
function textPieces(map: ProjectionMap, step: ReplaceStep): Piece[] | null {
  const { from, to } = step;
  if (from === to) return null;
  const $from = map.canonical.resolve(from);
  if (!$from.sameParent(map.canonical.resolve(to)) || !$from.parent.isTextblock) return null;
  const start = map.toProjection(from, 1);
  const end = map.toProjection(to, -1);
  if (start === null || end === null || start >= end) return null;
  const { projection } = map;
  if (projection.resolve(start).sameParent(projection.resolve(end))) return null;
  const pieces: Piece[] = [];
  projection.nodesBetween(start, end, (node, pos) => {
    if (!node.isTextblock) return true;
    const piece = {
      from: Math.max(pos + 1, start),
      to: Math.min(pos + 1 + node.content.size, end),
    };
    const mappedFrom = map.toCanonical(piece.from, 1);
    const mappedTo = map.toCanonical(piece.to, -1);
    const inside = mappedFrom !== null && mappedTo !== null && mappedFrom >= from && mappedTo <= to;
    if (piece.from < piece.to && inside) pieces.push(piece);
    return false;
  });
  return pieces;
}

// Mirrors a replacement that crosses page breaks: each piece of its range deleted on its own page,
// from the last, then its content inserted at its start.
function mirrorAcrossBreaks(
  map: ProjectionMap,
  edit: { readonly step: ReplaceStep; readonly canonical: ProseMirrorNode },
  pieces: readonly Piece[],
): Mirrored | null {
  const { step } = edit;
  const deletion = new ReplaceStep(step.from, step.to, Slice.empty);
  const deleted = deletion.apply(map.canonical).doc;
  if (!deleted) return null;
  const steps: Step[] = [];
  let projection = map.projection;
  let next = map.advanceCanonical(deletion, deleted);
  for (const piece of [...pieces].reverse()) {
    const remove = new ReplaceStep(piece.from, piece.to, Slice.empty);
    const result = remove.apply(projection);
    if (!result.doc) return null;
    projection = result.doc;
    steps.push(remove);
    next = next.advanceProjection(remove, projection);
  }
  if (step.slice.size === 0) return { steps, projection, map: next };
  const insertion = next.mirror(new ReplaceStep(step.from, step.from, step.slice), edit.canonical);
  if (!insertion) return null;
  return { ...insertion, steps: [...steps, ...insertion.steps] };
}

// Where a step inside one header row of a split table's first part lies: the table's id, the row
// and the step's offset from the row's start.
function headerEdit(step: RangeStep, doc: ProseMirrorNode) {
  const $from = doc.resolve(step.from);
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const table = $from.node(depth);
    if (table.type.name !== 'table') continue;
    if (table.attrs.splitPartIndex !== 0) continue;
    const id: unknown = table.attrs.dataId;
    const row = $from.index(depth);
    if (depth === $from.depth || row >= leadingHeaderRows(table)) continue;
    const start = $from.posAtIndex(row, depth);
    const original = table.child(row);
    if (step.to > start + original.nodeSize) return null;
    return {
      id: typeof id === 'string' && id ? id : null,
      row,
      start,
      original,
      offset: step.from - start,
    };
  }
  return null;
}

function mayRepeatRow(table: ProseMirrorNode, parent: ProseMirrorNode | null, row: number) {
  const count = projectedHeaderRows(table);
  if (count !== null) return row < count;
  if (
    parent?.type.name === 'table_figure' &&
    typeof parent.firstChild?.attrs.continuedText !== 'string'
  )
    return false;
  return row < leadingHeaderRows(table);
}

// Positions before the edit, where every actual copy of the original row starts.
function copyStarts(map: ProjectionMap, edit: NonNullable<ReturnType<typeof headerEdit>>) {
  const starts: number[] = [];
  const original = map.toCanonical(edit.start + 1, 1);
  map.projection.descendants((node, pos, parent) => {
    if (node.type.name !== 'table') return !node.isTextblock;
    if ((node.attrs.dataId ?? null) !== edit.id || (splitPartOf(node) ?? 0) === 0) return false;
    if (!mayRepeatRow(node, parent, edit.row)) return false;
    const copy = node.maybeChild(edit.row);
    if (!copy) return false;
    let from = pos + 1;
    for (let index = 0; index < edit.row; index += 1) from += node.child(index).nodeSize;
    // Editing an anonymous copy may replace the shared row node. Its mapped position still
    // identifies the original, unlike a distinct body row that happens to use header cells.
    const samePosition = original !== null && map.toCanonical(from + 1, 1) === original;
    if (samePosition || (edit.id && isTableHeaderCopy(edit.original, copy))) starts.push(from);
    return false;
  });
  return starts;
}

// Every visual copy of a footnote entry takes the same text or mark edit.
function noteCopyStarts(step: RangeStep, before: ProseMirrorNode, after: ProseMirrorNode) {
  const entry = footnoteAt(before.resolve(step.from));
  if (!entry || step.to > entry.from + entry.size) return null;
  const starts = footnoteCopies(after, entry.id)
    .filter(({ from }) => from !== entry.from)
    .map(({ from }) => from);
  return { starts, offset: entry.offset };
}

// The same edit on each repeated copy of the header row a step changed, in the document after it.
function repeatedCopies(step: Step, map: ProjectionMap, after: ProseMirrorNode): Step[] {
  if (!isRangeStep(step)) return [];
  const note = noteCopyStarts(step, map.projection, after);
  const header = note ? null : headerEdit(step, map.projection);
  const edit =
    note ??
    (header && {
      starts: copyStarts(map, header).map((from) => step.getMap().map(from)),
      offset: header.offset,
    });
  if (!edit) return [];
  // Each copy is placed in the document after the copies before it.
  let growth = 0;
  return edit.starts.map((start) => {
    const by = start + growth + edit.offset - step.from;
    const copy = placed(step, step.from + by, step.to + by);
    copy.getMap().forEach((...ends) => {
      growth += ends[3] - ends[2] - (ends[1] - ends[0]);
    });
    return copy;
  });
}

/**
 * A step the canonical document took, giving `canonical`, mirrored onto the projection: page by
 * page across a break, and onto every copy of a repeated header row. Null when it cannot be placed.
 */
export function mirrorStep(
  map: ProjectionMap,
  edit: { readonly step: Step; readonly canonical: ProseMirrorNode },
): Mirrored | null {
  const { step } = edit;
  const pieces = step instanceof ReplaceStep ? textPieces(map, step) : null;
  if (pieces && step instanceof ReplaceStep)
    return mirrorAcrossBreaks(map, { ...edit, step }, pieces);
  const primary = map.mapStep(step, 'toProjection');
  const applied = primary?.apply(map.projection);
  if (!primary || !applied?.doc) return null;
  const steps = [primary];
  let projection = applied.doc;
  let next = map.advance({
    projectionStep: primary,
    projection,
    canonicalStep: step,
    canonical: edit.canonical,
  });
  for (const copy of repeatedCopies(primary, map, projection)) {
    const result = copy.apply(projection);
    if (!result.doc) continue;
    projection = result.doc;
    steps.push(copy);
    next = next.advanceProjection(copy, projection);
  }
  return { steps, projection, map: next };
}
