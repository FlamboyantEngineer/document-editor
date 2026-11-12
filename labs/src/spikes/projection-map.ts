// Positions between the paged projection and the canonical whole document. The page transform that
// joins the projection's pages gives the map: its steps delete only page and fragment boundaries,
// so every position in the content's text maps exactly. Two places do not map through it, because
// joining moves or drops them: footnote entries, which move onto the last page, and the header rows
// a table continuation repeats, which joining drops. Those are found again by footnote id and by
// row, at the same offset.
//
// Edits between layouts extend the map: an edit made on one document and mirrored onto the other
// appends the projection step inverted and the canonical step, paired as mirrors, so positions
// inside newly inserted content map across too.

import { type Node as ProseMirrorNode, type ResolvedPos, Slice } from 'prosemirror-model';
import {
  AddMarkStep,
  Mapping,
  RemoveMarkStep,
  ReplaceStep,
  type Step,
  type StepMap,
} from 'prosemirror-transform';
import {
  FRAGMENT_RULES,
  type FragmentRules,
  joinDocumentPages,
  leadingHeaderRows,
} from '../../../src/model/index.js';

/** Which way a position is mapped. */
type Direction = 'toCanonical' | 'toProjection';

/** Counts of how positions were mapped, for the findings. */
export interface MapCounts {
  /** Positions that mapped through the page transform. */
  exact: number;
  /** Positions found again by footnote id or table row, as the transform dropped them. */
  redirected: number;
  /** Positions that mapped nowhere. */
  lost: number;
}

function footnoteEntryAt($pos: ResolvedPos): { id: string; offset: number } | null {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.name !== 'footnote_entry') continue;
    const id = node.attrs.footnoteId as unknown;
    return typeof id === 'string' && id ? { id, offset: $pos.pos - $pos.start(depth) } : null;
  }
  return null;
}

function findFootnoteEntry(doc: ProseMirrorNode, id: string): number | null {
  let found: number | null = null;
  doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name === 'footnote_entry' && node.attrs.footnoteId === id) found = pos + 1;
    return node.isBlock && !node.isTextblock;
  });
  return found;
}

// A position inside a header row that a table continuation repeats: the row's index and the offset
// in it, and where the continuation's first body row starts.
function repeatedHeaderAt($pos: ResolvedPos) {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const table = $pos.node(depth);
    if (table.type.name !== 'table') continue;
    const part = table.attrs.splitPartIndex as unknown;
    if (typeof part !== 'number' || part < 1 || depth === $pos.depth) return null;
    const row = $pos.index(depth);
    const headers = leadingHeaderRows(table);
    if (row >= headers || headers >= table.childCount) return null;
    const start = $pos.start(depth);
    let rowStart = start;
    for (let index = 0; index < row; index += 1) rowStart += table.child(index).nodeSize;
    let bodyStart = start;
    for (let index = 0; index < headers; index += 1) bodyStart += table.child(index).nodeSize;
    return { row, offset: $pos.pos - rowStart, bodyStart };
  }
  return null;
}

// The start of row `row` in the table around `pos`.
function rowStartIn(doc: ProseMirrorNode, pos: number, row: number): number | null {
  const $pos = doc.resolve(pos);
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    const table = $pos.node(depth);
    if (table.type.name !== 'table') continue;
    if (row >= table.childCount) return null;
    let at = $pos.start(depth);
    for (let index = 0; index < row; index += 1) at += table.child(index).nodeSize;
    return at;
  }
  return null;
}

function sameRanges(left: StepMap, right: StepMap): boolean {
  const sizes = (map: StepMap) => {
    const all: number[] = [];
    map.forEach((oldStart, oldEnd, newStart, newEnd) =>
      all.push(oldEnd - oldStart, newEnd - newStart),
    );
    return all.join(',');
  };
  return sizes(left) === sizes(right);
}

/** The positions between a paged projection and the canonical whole document it shows. */
export class ProjectionMap {
  /** Projection to canonical. */
  private readonly forward: Mapping;
  private backwardCache: Mapping | null = null;
  readonly counts: MapCounts;

  private constructor(
    readonly projection: ProseMirrorNode,
    readonly canonical: ProseMirrorNode,
    forward: Mapping,
    counts: MapCounts,
  ) {
    this.forward = forward;
    this.counts = counts;
  }

  /** The map of a paged projection, with the whole document its pages join into. */
  static of(
    projection: ProseMirrorNode,
    rules: FragmentRules = FRAGMENT_RULES,
  ): { map: ProjectionMap; whole: ProseMirrorNode } {
    const joined = joinDocumentPages(projection, rules);
    const counts = { exact: 0, redirected: 0, lost: 0 };
    return {
      map: new ProjectionMap(projection, joined.doc, joined.mapping, counts),
      whole: joined.doc,
    };
  }

  /** How many steps the map runs through; it grows with each mirrored edit until the next layout. */
  get length(): number {
    return this.forward.maps.length;
  }

  private get backward(): Mapping {
    this.backwardCache ??= this.forward.invert();
    return this.backwardCache;
  }

  /**
   * A projection position in the canonical document; null when it maps nowhere. By default a
   * position keeps to the text on its side of a page break: the end of a part to the text before it,
   * as content inserted at the break since the last layout may lie between the two sides.
   */
  toCanonical(pos: number, assoc?: -1 | 1): number | null {
    return this.mapPosition(pos, assoc ?? this.side(pos), 'toCanonical');
  }

  // -1 at the end of a textblock, so the position keeps to the text before it; otherwise 1.
  private side(pos: number): -1 | 1 {
    const $pos = this.projection.resolve(pos);
    return $pos.parent.isTextblock && $pos.parentOffset === $pos.parent.content.size ? -1 : 1;
  }

  /** A canonical position in the projection; at a page break, `assoc` picks the side. */
  toProjection(pos: number, assoc: -1 | 1 = 1): number | null {
    return this.mapPosition(pos, assoc, 'toProjection');
  }

  private mapPosition(pos: number, assoc: -1 | 1, direction: Direction): number | null {
    const toCanonical = direction === 'toCanonical';
    const [from, to] = toCanonical
      ? [this.projection, this.canonical]
      : [this.canonical, this.projection];
    const result = (toCanonical ? this.forward : this.backward).mapResult(pos, assoc);
    if (!result.deletedAcross) {
      this.counts.exact += 1;
      return result.pos;
    }
    const redirected = this.redirect(from.resolve(pos), to, direction);
    if (redirected === null) this.counts.lost += 1;
    else this.counts.redirected += 1;
    return redirected;
  }

  // Finds a position the page transform moved or dropped again, by footnote id or by table row.
  private redirect($pos: ResolvedPos, to: ProseMirrorNode, direction: Direction): number | null {
    const entry = footnoteEntryAt($pos);
    if (entry) {
      const start = findFootnoteEntry(to, entry.id);
      if (start === null) return null;
      const size = to.resolve(start).parent.content.size;
      return start + Math.min(entry.offset, size);
    }
    if (direction !== 'toCanonical') return null;
    const header = repeatedHeaderAt($pos);
    if (!header) return null;
    const body = this.forward.mapResult(header.bodyStart + 1, 1);
    if (body.deletedAcross) return null;
    const rowStart = rowStartIn(to, body.pos, header.row);
    return rowStart === null ? null : rowStart + header.offset;
  }

  /**
   * A step on one document as the same edit on the other; null when it cannot be placed. Text
   * replacements and marks map each end, footnote entries and repeated header rows included; other
   * steps map through the page transform alone.
   */
  mapStep(step: Step, direction: Direction): Step | null {
    const map = (pos: number, assoc: -1 | 1) => this.mapPosition(pos, assoc, direction);
    if (
      step instanceof ReplaceStep ||
      step instanceof AddMarkStep ||
      step instanceof RemoveMarkStep
    ) {
      const { from: stepFrom, to: stepTo } = step as unknown as { from: number; to: number };
      const empty = stepFrom === stepTo;
      const from = map(stepFrom, empty && direction === 'toCanonical' ? this.side(stepFrom) : 1);
      const to = empty ? from : map(stepTo, -1);
      if (from === null || to === null) return null;
      const end = Math.max(from, to);
      if (step instanceof ReplaceStep) {
        const { slice, structure } = step as unknown as {
          slice: ConstructorParameters<typeof ReplaceStep>[2];
          structure: boolean;
        };
        return new ReplaceStep(from, end, slice, structure);
      }
      if (step instanceof AddMarkStep) return new AddMarkStep(from, end, step.mark);
      return new RemoveMarkStep(from, end, (step as RemoveMarkStep).mark);
    }
    return step.map(direction === 'toCanonical' ? this.forward : this.backward);
  }

  /**
   * The map after an edit made on both documents: `projectionStep` on the projection and
   * `canonicalStep` on the canonical document, the same edit. They pair as mirrors when their maps
   * have the same shape, so content either inserts maps across.
   */
  advance(
    projectionStep: Step,
    projection: ProseMirrorNode,
    canonicalStep: Step,
    canonical: ProseMirrorNode,
  ): ProjectionMap {
    const projectionMap = projectionStep.getMap();
    const canonicalMap = canonicalStep.getMap();
    const forward = new Mapping();
    forward.appendMap(projectionMap.invert());
    const inverted = 0;
    forward.appendMapping(this.forward);
    if (sameRanges(projectionMap, canonicalMap)) forward.appendMap(canonicalMap, inverted);
    else forward.appendMap(canonicalMap);
    return new ProjectionMap(projection, canonical, forward, this.counts);
  }

  /** The map after an edit made on the canonical document alone. */
  advanceCanonical(canonicalStep: Step, canonical: ProseMirrorNode): ProjectionMap {
    const forward = new Mapping();
    forward.appendMapping(this.forward);
    forward.appendMap(canonicalStep.getMap());
    return new ProjectionMap(this.projection, canonical, forward, this.counts);
  }

  // A replacement inside one canonical textblock whose range crosses a page break in the
  // projection: the projection ranges of its text on each side, in order. Deleted as one step there,
  // the range would join the pages and drop the footnotes, header and footer between them.
  private textPieces(step: ReplaceStep): { from: number; to: number }[] | null {
    const { from, to } = step;
    if (from === to) return null;
    const $from = this.canonical.resolve(from);
    if (!$from.sameParent(this.canonical.resolve(to)) || !$from.parent.isTextblock) return null;
    const start = this.toProjection(from, 1);
    const end = this.toProjection(to, -1);
    if (start === null || end === null || start >= end) return null;
    if (this.projection.resolve(start).sameParent(this.projection.resolve(end))) return null;
    const pieces: { from: number; to: number }[] = [];
    this.projection.nodesBetween(start, end, (node, pos) => {
      if (!node.isTextblock) return true;
      const pieceFrom = Math.max(pos + 1, start);
      const pieceTo = Math.min(pos + 1 + node.content.size, end);
      const mappedFrom = this.forward.mapResult(pieceFrom, 1);
      const mappedTo = this.forward.mapResult(pieceTo, -1);
      const inside = !mappedFrom.deletedAcross && mappedFrom.pos >= from && mappedTo.pos <= to;
      if (pieceFrom < pieceTo && inside) pieces.push({ from: pieceFrom, to: pieceTo });
      return false;
    });
    return pieces;
  }

  // Mirrors a replacement that crosses page breaks: each piece of its range deleted on its own
  // page, from the last, and then its content inserted at its start.
  private mirrorAcrossBreaks(
    step: ReplaceStep,
    pieces: readonly { from: number; to: number }[],
    canonical: ProseMirrorNode,
  ): Mirrored | null {
    const deletion = new ReplaceStep(step.from, step.to, Slice.empty);
    const deleted = deletion.apply(this.canonical).doc;
    if (!deleted) return null;
    const steps: Step[] = [];
    let projection = this.projection;
    // The canonical step's map goes after the page transform and the pieces' before it, so the
    // two can be added in either order.
    let map = this.advanceCanonical(deletion, deleted);
    for (const piece of [...pieces].reverse()) {
      const remove = new ReplaceStep(piece.from, piece.to, Slice.empty);
      const result = remove.apply(projection);
      if (!result.doc) return null;
      projection = result.doc;
      steps.push(remove);
      map = map.advanceProjection(remove, projection);
    }
    if (step.slice.size === 0) return { steps, projection, map };
    const insertion = map.mirror(new ReplaceStep(step.from, step.from, step.slice), canonical);
    if (!insertion) return null;
    return {
      steps: [...steps, ...insertion.steps],
      projection: insertion.projection,
      map: insertion.map,
    };
  }

  /** The map after an edit made on the projection alone, such as a repeated header row's copy. */
  advanceProjection(projectionStep: Step, projection: ProseMirrorNode): ProjectionMap {
    const forward = new Mapping();
    forward.appendMap(projectionStep.getMap().invert());
    forward.appendMapping(this.forward);
    return new ProjectionMap(projection, this.canonical, forward, this.counts);
  }

  /**
   * Mirrors a step the canonical document took, giving `canonical`, onto the projection: the step
   * mapped, then the same edit on each copy of a header row that the table's continuations repeat.
   * Null when the step cannot be placed.
   */
  mirror(step: Step, canonical: ProseMirrorNode): Mirrored | null {
    const pieces = step instanceof ReplaceStep ? this.textPieces(step) : null;
    if (pieces) return this.mirrorAcrossBreaks(step as ReplaceStep, pieces, canonical);
    const primary = this.mapStep(step, 'toProjection');
    const applied = primary?.apply(this.projection);
    if (!primary || !applied?.doc) return null;
    const steps = [primary];
    let projection = applied.doc;
    let map = this.advance(primary, projection, step, canonical);
    for (const copy of headerCopies(primary, this.projection, projection)) {
      const result = copy.apply(projection);
      if (!result.doc) continue;
      projection = result.doc;
      steps.push(copy);
      map = map.advanceProjection(copy, projection);
    }
    return { steps, projection, map };
  }
}

/** A canonical step mirrored onto the projection. */
export interface Mirrored {
  readonly steps: readonly Step[];
  readonly projection: ProseMirrorNode;
  readonly map: ProjectionMap;
}

function rangeOf(step: Step): { from: number; to: number } | null {
  if (
    step instanceof ReplaceStep ||
    step instanceof AddMarkStep ||
    step instanceof RemoveMarkStep
  ) {
    return step as unknown as { from: number; to: number };
  }
  return null;
}

// The step moved by `by`.
function shifted(step: Step, by: number): Step | null {
  const range = rangeOf(step);
  if (!range) return null;
  const { from, to } = range;
  if (step instanceof ReplaceStep) {
    const { slice, structure } = step as unknown as {
      slice: ConstructorParameters<typeof ReplaceStep>[2];
      structure: boolean;
    };
    return new ReplaceStep(from + by, to + by, slice, structure);
  }
  if (step instanceof AddMarkStep) return new AddMarkStep(from + by, to + by, step.mark);
  return new RemoveMarkStep(from + by, to + by, (step as RemoveMarkStep).mark);
}

// Where a step inside one header row of a split table's first part lies: the table's id, the row
// and the step's offset from the row's start.
function headerEdit(step: Step, doc: ProseMirrorNode) {
  const range = rangeOf(step);
  if (!range) return null;
  const $from = doc.resolve(range.from);
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const table = $from.node(depth);
    if (table.type.name !== 'table') continue;
    const id = table.attrs.dataId as unknown;
    const part = table.attrs.splitPartIndex as unknown;
    if (typeof id !== 'string' || !id || part !== 0 || depth === $from.depth) return null;
    const row = $from.index(depth);
    if (row >= leadingHeaderRows(table)) return null;
    const rowStart = $from.posAtIndex(row, depth);
    if (range.to > rowStart + table.child(row).nodeSize) return null;
    return { id, row, offset: range.from - rowStart };
  }
  return null;
}

// The same edit on each repeated copy of the header row a step changed, in the projection after it.
function headerCopies(step: Step, before: ProseMirrorNode, after: ProseMirrorNode): Step[] {
  const edit = headerEdit(step, before);
  const range = rangeOf(step);
  if (!edit || !range) return [];
  const starts: number[] = [];
  after.descendants((node, pos) => {
    if (node.type.name !== 'table') return !node.isTextblock;
    const part = node.attrs.splitPartIndex as unknown;
    if (node.attrs.dataId !== edit.id || typeof part !== 'number' || part < 1) return false;
    if (edit.row < leadingHeaderRows(node) && edit.row < node.childCount - 1) {
      let rowStart = pos + 1;
      for (let index = 0; index < edit.row; index += 1) rowStart += node.child(index).nodeSize;
      starts.push(rowStart);
    }
    return false;
  });
  // Each copy is placed in the document after the copies before it.
  let growth = 0;
  return starts.flatMap((rowStart) => {
    const copy = shifted(step, rowStart + growth + edit.offset - range.from);
    if (!copy) return [];
    const map = copy.getMap();
    growth += map.map(Number.MAX_SAFE_INTEGER >>> 1) - (Number.MAX_SAFE_INTEGER >>> 1);
    return [copy];
  });
}
