// Where a table's rows and columns are drawn, relative to the table handles' layer, and the gaps
// between them a dragged row or column can drop into.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { TableMap } from 'prosemirror-tables';
import type { EditorView } from 'prosemirror-view';
import type { TableAxis } from '../../engine/index.js';

/** A box in pixels, relative to the handles' layer. */
export interface Box {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

/** A table's box and the boxes of its rows and columns. */
export interface TableGeometry {
  readonly table: Box;
  readonly rows: readonly Box[];
  readonly columns: readonly Box[];
}

type Rect = Pick<DOMRect, 'top' | 'left' | 'width' | 'height'>;

const relative = (rect: Rect, origin: Rect): Box => ({
  top: rect.top - origin.top,
  left: rect.left - origin.left,
  width: rect.width,
  height: rect.height,
});

const isElement = (node: Node | null): node is HTMLElement => node?.nodeType === 1;

// The horizontal extent of a column: a cell of its own, or its share of a cell spanning it.
function columnRect(
  view: EditorView,
  { node, start, map }: { node: ProseMirrorNode; start: number; map: TableMap },
  column: number,
): Rect | null {
  let shared: Rect | null = null;
  for (let row = 0; row < map.height; row += 1) {
    const offset = map.map[row * map.width + column] ?? 0;
    const dom = view.nodeDOM(start + offset);
    if (!isElement(dom)) continue;
    const rect = dom.getBoundingClientRect();
    const span = Number(node.nodeAt(offset)?.attrs.colspan ?? 1);
    if (span === 1) return rect;
    if (!shared) {
      const { left } = map.findCell(offset);
      const width = rect.width / span;
      shared = {
        left: rect.left + width * (column - left),
        top: rect.top,
        width,
        height: rect.height,
      };
    }
  }
  return shared;
}

// The table element a table is drawn in: the one the pointer was over while it is still drawn, as
// a split table's part on a page, or the table's own.
function tableElement(view: EditorView, pos: number, element: Element | null): Element | null {
  if (element?.isConnected && view.dom.contains(element)) return element;
  const dom = view.nodeDOM(pos);
  if (!isElement(dom)) return null;
  return dom.tagName === 'TABLE' ? dom : dom.querySelector('table');
}

// The index of the row of the table before `pos` that a drawn row stands for; null for none.
function rowIndexOf(view: EditorView, pos: number, row: Element): number | null {
  let at: number;
  try {
    at = view.posAtDOM(row, 0);
  } catch {
    return null;
  }
  const { doc } = view.state;
  const depth = doc.resolve(pos + 1).depth;
  const $at = doc.resolve(at);
  return $at.depth > depth && $at.before(depth) === pos ? $at.index(depth) : null;
}

// The boxes of a table's rows, by index, from the rows a table element draws. A row it does not
// draw, as one on another page, lies before it when a later row is drawn and after it otherwise,
// so the gaps between drawn rows count every row of the table.
function rowBoxes(
  view: EditorView,
  { pos, height, table }: { pos: number; height: number; table: Element },
  origin: Rect,
): Box[] | null {
  const drawn = new Map<number, Box>();
  for (const row of Array.from((table as HTMLTableElement).rows)) {
    const index = rowIndexOf(view, pos, row);
    if (index !== null && !drawn.has(index)) {
      drawn.set(index, relative(row.getBoundingClientRect(), origin));
    }
  }
  if (drawn.size === 0) return null;
  const last = Math.max(...drawn.keys());
  const box = relative(table.getBoundingClientRect(), origin);
  return Array.from({ length: height }, (_, index) => {
    const top = index < last ? -Infinity : Infinity;
    return drawn.get(index) ?? { top, left: box.left, width: box.width, height: 0 };
  });
}

/**
 * Measures the table before `pos` where `element` draws it, or where it is drawn, relative to
 * `origin`; null when it is not drawn.
 */
export function measureTable(
  view: EditorView,
  { pos, element }: { pos: number; element: Element | null },
  origin: Rect,
): TableGeometry | null {
  // A resize the observer reports after the editor is gone measures nothing.
  if (view.isDestroyed) return null;
  const node = view.state.doc.nodeAt(pos);
  const table = node?.type.spec.tableRole === 'table' ? tableElement(view, pos, element) : null;
  if (!node || !table) return null;
  const map = TableMap.get(node);
  const rows = rowBoxes(view, { pos, height: map.height, table }, origin);
  const columns: Box[] = [];
  for (let column = 0; column < map.width; column += 1) {
    const rect = columnRect(view, { node, start: pos + 1, map }, column);
    if (rect) columns.push(relative(rect, origin));
  }
  if (!rows || columns.length !== map.width) return null;
  return { table: relative(table.getBoundingClientRect(), origin), rows, columns };
}

/** Whether a row's box is drawn, rather than standing for a row drawn elsewhere. */
export const isDrawn = (box: Box): boolean => Number.isFinite(box.top);

// Where the gap before row `gap` is drawn: at its row, or next to the nearest drawn row.
function rowGapTop(rows: readonly Box[], gap: number, table: Box): number {
  const before = rows[gap];
  if (before && isDrawn(before)) return before.top;
  if (before && before.top < 0) return rows.slice(gap).find(isDrawn)?.top ?? table.top;
  const previous = rows.slice(0, gap).findLast(isDrawn);
  return previous ? previous.top + previous.height : table.top;
}

/** The gap nearest a point along an axis: 0 before the first row or column, n after the last. */
export function gapAt(boxes: readonly Box[], axis: TableAxis, point: number): number {
  let gap = 0;
  for (const box of boxes) {
    const middle = axis === 'row' ? box.top + box.height / 2 : box.left + box.width / 2;
    if (point > middle) gap += 1;
  }
  return gap;
}

/** The index a row or column at `from` moves to when dropped into a gap. */
export const gapTarget = (from: number, gap: number): number => (gap > from ? gap - 1 : gap);

/** The line that marks a gap: across the table, at the edge between two rows or columns. */
export function gapBox(geometry: TableGeometry, axis: TableAxis, gap: number): Box {
  const { table } = geometry;
  if (axis === 'row') {
    return {
      top: rowGapTop(geometry.rows, gap, table),
      left: table.left,
      width: table.width,
      height: 0,
    };
  }
  const boxes = geometry.columns;
  const before = boxes[gap];
  const last = boxes[boxes.length - 1];
  const left = before ? before.left : last ? last.left + last.width : table.left;
  return { top: table.top, left, width: 0, height: table.height };
}

/** A box as the measured properties a handle or the drop indicator is placed by. */
export function boxProperties(box: Box): Record<string, string> {
  return {
    '--de-table-handles-top': `${String(Math.round(box.top))}px`,
    '--de-table-handles-left': `${String(Math.round(box.left))}px`,
    '--de-table-handles-width': `${String(Math.round(box.width))}px`,
    '--de-table-handles-height': `${String(Math.round(box.height))}px`,
  };
}
