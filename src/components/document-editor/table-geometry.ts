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

/** Measures the table before `pos`, relative to `origin`; null when it is not drawn. */
export function measureTable(view: EditorView, pos: number, origin: Rect): TableGeometry | null {
  // A resize the observer reports after the editor is gone measures nothing.
  if (view.isDestroyed) return null;
  const node = view.state.doc.nodeAt(pos);
  const dom = view.nodeDOM(pos);
  if (node?.type.spec.tableRole !== 'table' || !isElement(dom)) return null;
  const table = dom.tagName === 'TABLE' ? dom : dom.querySelector('table');
  if (!table) return null;
  const map = TableMap.get(node);
  const rowElements = Array.from((table as HTMLTableElement).rows);
  const rows = rowElements.map((row) => relative(row.getBoundingClientRect(), origin));
  const columns: Box[] = [];
  for (let column = 0; column < map.width; column += 1) {
    const rect = columnRect(view, { node, start: pos + 1, map }, column);
    if (rect) columns.push(relative(rect, origin));
  }
  if (rows.length !== map.height || columns.length !== map.width) return null;
  return { table: relative(table.getBoundingClientRect(), origin), rows, columns };
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
  const boxes = axis === 'row' ? geometry.rows : geometry.columns;
  const before = boxes[gap];
  const last = boxes[boxes.length - 1];
  if (axis === 'row') {
    const top = before ? before.top : last ? last.top + last.height : table.top;
    return { top, left: table.left, width: table.width, height: 0 };
  }
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
