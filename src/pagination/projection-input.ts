// Input on the paged projection, routed to the canonical state. Keys that edit and paste run as
// commands on the canonical state (`ProjectionView.run`). Changes the browser makes in the DOM
// (typing, IME composition, spellcheck replacements, drag and drop) cannot be refused without
// redrawing under the writer, so they arrive as projection transactions: each step is mapped onto
// the canonical state and paired with its mirror, so the DOM keeps what the browser drew. A column
// resized on one part of a split table sets the canonical table's column, so every part follows.

import { baseKeymap, chainCommands } from 'prosemirror-commands';
import { keydownHandler } from 'prosemirror-keymap';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import {
  type Command,
  type EditorState,
  type Selection,
  TextSelection,
  type Transaction,
} from 'prosemirror-state';
import { cellAround, TableMap } from 'prosemirror-tables';
import { ReplaceAroundStep, type Step } from 'prosemirror-transform';
import type { EditorView } from 'prosemirror-view';
import type { ProjectionMap } from './projection-map.js';
import { canonicalSelection } from './selection-mirror.js';

/** The two documents an input reads: the canonical state, the projection's state and their map. */
export interface InputSource {
  readonly canonical: EditorState;
  readonly projection: EditorState;
  readonly map: ProjectionMap;
}

/** A projection edit routed: the canonical transaction, its mirror on the projection, the map. */
export interface RoutedEdit {
  readonly canonical: Transaction;
  readonly projection: Transaction;
  readonly map: ProjectionMap;
  /** Whether a step touched a page break, after which the map is built again from the pages. */
  readonly atBreak: boolean;
}

/**
 * Deletes the character before (-1) or after (1) an empty selection inside a textblock, as the
 * browser would in its DOM; the canonical state has none.
 */
export function deleteCharacter(direction: -1 | 1): Command {
  return (state, dispatch) => {
    const { $cursor } = state.selection as TextSelection;
    if (!$cursor) return false;
    const { pos } = $cursor;
    if (pos === (direction < 0 ? $cursor.start() : $cursor.end())) return false;
    const around = [pos, pos + direction * 2].sort((left, right) => left - right);
    const text = state.doc.textBetween(around[0] ?? pos, around[1] ?? pos);
    const width = text.length === 2 && /[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(text) ? 2 : 1;
    const [from, to] = direction < 0 ? [pos - width, pos] : [pos, pos + width];
    dispatch?.(state.tr.delete(from, to).scrollIntoView());
    return true;
  };
}

// Whether a position is at the start or end of a split block's part, where both sides of a page
// break are one canonical position. Two edits there, one on each side of the break, leave their
// order to the edges of the extended map's ranges, which do not keep it.
function atBreak(doc: ProseMirrorNode, pos: number): boolean {
  if (pos < 0 || pos > doc.content.size) return false;
  const $pos = doc.resolve(pos);
  if (!$pos.parent.isTextblock) return false;
  if ($pos.parentOffset !== 0 && $pos.parentOffset !== $pos.parent.content.size) return false;
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if (typeof $pos.node(depth).attrs.splitPartIndex === 'number') return true;
  }
  return false;
}

/** Whether a step's range starts or ends at a page break inside a split block. */
export function touchesBreak(step: Step, doc: ProseMirrorNode): boolean {
  const range = step as unknown as { from?: unknown; to?: unknown };
  if (typeof range.from !== 'number' || typeof range.to !== 'number') return false;
  return atBreak(doc, range.from) || atBreak(doc, range.to);
}

// The node types that hold a page's regions, which an edit taken as the browser made it never
// crosses.
const PAGE_STRUCTURE = new Set(['doc', 'page_section', 'page']);

// Whether a step's range lies inside one region of one page.
function withinRegion(step: Step, doc: ProseMirrorNode): boolean {
  const range = step as unknown as { from?: unknown; to?: unknown };
  if (typeof range.from !== 'number' || typeof range.to !== 'number') return false;
  const $from = doc.resolve(range.from);
  const shared = $from.node($from.sharedDepth(range.to));
  return !PAGE_STRUCTURE.has(shared.type.name);
}

/** Whether a projection transaction only sets cell widths, as a column resize does. */
export function isColumnWidthChange(tr: Transaction): boolean {
  return (
    tr.steps.length > 0 &&
    tr.steps.every((step) => {
      if (!(step instanceof ReplaceAroundStep)) return false;
      const role = tr.before.nodeAt(step.from)?.type.spec.tableRole as unknown;
      return role === 'cell' || role === 'header_cell';
    })
  );
}

// Each step of a projection edit on the canonical transaction, and its mirror on the projection's;
// false when a step cannot be placed.
function routeSteps(tr: Transaction, target: RoutedEdit & { map: ProjectionMap }): boolean {
  const { canonical: ctr, projection: ptr } = target;
  let { map } = target;
  let crossed = false;
  const placed = tr.steps.every((step, index) => {
    const routed = map.mapStep(step, 'toCanonical');
    if (!routed || ctr.maybeStep(routed).failed) return false;
    crossed ||= touchesBreak(step, tr.docs[index] ?? tr.before);
    const echo = map.mirror(routed, ctr.doc);
    // A step in a repeated header row comes back on every copy and the first part's row.
    if (echo && (echo.projection.eq(tr.docs[index + 1] ?? tr.doc) || echo.steps.length > 1)) {
      for (const each of echo.steps) ptr.step(each);
      map = echo.map;
      return true;
    }
    // Taken as the browser made it, a step must stay inside one region of one page, so the pages
    // still join into the canonical document.
    if (!withinRegion(step, ptr.doc) || ptr.maybeStep(step).failed) return false;
    map = map.advance({
      projectionStep: step,
      projection: ptr.doc,
      canonicalStep: routed,
      canonical: ctr.doc,
    });
    return true;
  });
  Object.assign(target, { map, atBreak: crossed });
  return placed;
}

// The projection selection after a routed edit: the edit's own where the mirror matches it.
function routedSelection(tr: Transaction, ptr: Transaction): Selection {
  if (!ptr.doc.eq(tr.doc)) return tr.selection.map(ptr.doc, ptr.mapping);
  return TextSelection.between(
    ptr.doc.resolve(tr.selection.anchor),
    ptr.doc.resolve(tr.selection.head),
  );
}

/**
 * A projection edit the browser made in the DOM, routed: each step mapped onto the canonical state
 * and paired with its mirror. Null when a step cannot be placed, and the projection then refuses
 * the edit.
 */
export function routeDomChange(tr: Transaction, source: InputSource): RoutedEdit | null {
  const target = {
    canonical: source.canonical.tr,
    projection: source.projection.tr,
    map: source.map,
    atBreak: false,
  };
  if (!routeSteps(tr, target)) return null;
  const selection = routedSelection(tr, target.projection);
  target.projection.setSelection(selection);
  // A selection that only followed the edit, as typing's does, follows it on the canonical state
  // too: mapped across a page break, it could land on the wrong side of the new text.
  const followed = tr.selection.eq(source.projection.selection.map(tr.doc, tr.mapping));
  const mapped = followed ? null : canonicalSelection(target.map, selection, target.canonical.doc);
  if (mapped) target.canonical.setSelection(mapped);
  return target;
}

const columnWidths = (node: ProseMirrorNode) => (node.attrs.colwidth as number[] | null) ?? [];

// The column a resize on the projection changed, and its new width.
function resizedColumn(tr: Transaction) {
  const { from } = tr.steps[0] as ReplaceAroundStep;
  const before = tr.before.nodeAt(from);
  const after = tr.doc.nodeAt(from);
  const $cell = tr.doc.resolve(from);
  const part = $cell.parent.type.spec.tableRole === 'row' ? $cell.node(-1) : null;
  if (!before || !after || part?.type.spec.tableRole !== 'table') return null;
  const changed = columnWidths(after).findIndex(
    (width, index) => width !== columnWidths(before)[index],
  );
  const width = columnWidths(after)[changed];
  if (changed < 0 || width === undefined) return null;
  const column = TableMap.get(part).findCell(from - $cell.start(-1)).left + changed;
  return { from, column, width };
}

// The canonical table around a canonical position, and where its content starts.
function tableAround(doc: ProseMirrorNode, pos: number) {
  const $pos = doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.spec.tableRole === 'table') {
      return { table: $pos.node(depth), start: $pos.start(depth) };
    }
  }
  return null;
}

/**
 * A column resized on one part of a split table, as a canonical transaction that sets the width on
 * the canonical table's column; null when the resize cannot be placed.
 */
export function routeColumnWidth(tr: Transaction, source: InputSource): Transaction | null {
  const resized = resizedColumn(tr);
  const at = resized ? source.map.toCanonical(resized.from + 1, 1) : null;
  const found = at === null ? null : tableAround(source.canonical.doc, at);
  if (!resized || !found) return null;
  const { table, start } = found;
  const tableMap = TableMap.get(table);
  const ctr = source.canonical.tr;
  for (let row = 0; row < tableMap.height; row += 1) {
    const index = row * tableMap.width + resized.column;
    if (row && tableMap.map[index] === tableMap.map[index - tableMap.width]) continue;
    const pos = tableMap.map[index];
    const node = pos === undefined ? null : table.nodeAt(pos);
    if (!node || pos === undefined) continue;
    const widths = columnWidths(node);
    const colwidth = widths.length
      ? [...widths]
      : Array<number>(node.attrs.colspan as number).fill(0);
    colwidth[resized.column - tableMap.colCount(pos)] = resized.width;
    ctr.setNodeMarkup(start + pos, null, { ...node.attrs, colwidth });
  }
  return ctr;
}

/** The canonical position of the cell under a pointer on the projection; null outside a cell. */
export function canonicalCellAt(
  view: EditorView,
  source: Pick<InputSource, 'canonical' | 'map'>,
  event: MouseEvent,
): number | null {
  const found = view.posAtCoords({ left: event.clientX, top: event.clientY });
  const $cell = found ? cellAround(view.state.doc.resolve(found.pos)) : null;
  const at = $cell ? source.map.toCanonical($cell.pos + 1, 1) : null;
  const $canonical = at === null ? null : cellAround(source.canonical.doc.resolve(at));
  return $canonical ? $canonical.pos : null;
}

/** What the projection's keys run: canonical commands, and moves across a page break. */
export interface KeyRouting {
  /** Further commands on the canonical state by key. */
  readonly keys?: Readonly<Record<string, Command>> | undefined;
  /** Runs a command on the canonical state, with the projection's selection mirrored there. */
  run(command: Command): boolean;
  /** Moves the caret a character across a page break inside a split block; false elsewhere. */
  across(move: { readonly direction: -1 | 1; readonly extend: boolean }): boolean;
}

/**
 * The projection's key handler: Enter, Backspace, Delete and the host's keys run on the canonical
 * state, and arrows cross a page break inside a split block by a character.
 */
export function projectionKeys(routing: KeyRouting) {
  const canonical =
    (command: Command): Command =>
    () =>
      routing.run(command);
  const across = (direction: -1 | 1, extend: boolean) => () =>
    routing.across({ direction, extend });
  const keep = () => false;
  return keydownHandler({
    ...Object.fromEntries(
      Object.entries(routing.keys ?? {}).map(([key, command]) => [key, canonical(command)]),
    ),
    Enter: canonical(baseKeymap.Enter ?? keep),
    Backspace: canonical(chainCommands(baseKeymap.Backspace ?? keep, deleteCharacter(-1))),
    Delete: canonical(chainCommands(baseKeymap.Delete ?? keep, deleteCharacter(1))),
    ArrowLeft: across(-1, false),
    ArrowRight: across(1, false),
    'Shift-ArrowLeft': across(-1, true),
    'Shift-ArrowRight': across(1, true),
  });
}

/** Carries a projection transaction's meta, such as a composition's, over to its routed mirror. */
export function copyMeta(from: Transaction, to: Transaction): void {
  const meta = (from as unknown as { readonly meta: Readonly<Record<string, unknown>> }).meta;
  for (const [key, value] of Object.entries(meta)) to.setMeta(key, value);
}
