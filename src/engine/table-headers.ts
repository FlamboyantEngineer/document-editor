// A table's header cells: any row or column may be made one of header cells, and made plain again.
// The leading rows and columns of header cells are the table's header rows and columns, which a
// table split across pages repeats and rows or columns inserted beside them join.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Command, Transaction } from 'prosemirror-state';
import { findTable, isInTable, selectedRect, TableMap } from 'prosemirror-tables';
import type { TableAxis } from './tables.js';

/** How many leading rows and leading columns of a table hold only header cells. */
interface TableHeaders {
  readonly rows: number;
  readonly columns: number;
}

const isHeader = (cell: ProseMirrorNode | null | undefined) =>
  cell?.type.spec.tableRole === 'header_cell';

// How many leading rows, or columns, hold only header cells, from the row (column) `skip` on
// across.
function leadingHeaders(table: ProseMirrorNode, axis: TableAxis, skip = 0): number {
  const map = TableMap.get(table);
  const [count, across] = axis === 'row' ? [map.height, map.width] : [map.width, map.height];
  if (skip >= across) return 0;
  for (let line = 0; line < count; line += 1) {
    for (let other = skip; other < across; other += 1) {
      const [row, column] = axis === 'row' ? [line, other] : [other, line];
      if (!isHeader(table.nodeAt(map.map[row * map.width + column] ?? 0))) return line;
    }
  }
  return count;
}

/**
 * The header rows and header columns of a table. A header column is told by the cells below the
 * header rows, so a table of header cells only has header rows and no header column.
 */
export function tableHeaders(table: ProseMirrorNode): TableHeaders {
  const rows = leadingHeaders(table, 'row');
  return { rows, columns: leadingHeaders(table, 'column', rows) };
}

/** The rows or columns `from` to `to` (exclusive) of a table. */
interface TableLines {
  readonly axis: TableAxis;
  readonly from: number;
  readonly to: number;
}

export const headerKey = (axis: TableAxis) => (axis === 'row' ? 'rows' : 'columns');

const across = (axis: TableAxis): TableAxis => (axis === 'row' ? 'column' : 'row');

// The rows (or columns) of a table all of whose cells are header cells, leaving out the cells
// that start in the lines given across them.
function headerLines(table: ProseMirrorNode, axis: TableAxis, leaving?: TableLines): Set<number> {
  const map = TableMap.get(table);
  const count = axis === 'row' ? map.height : map.width;
  const lines = new Set(Array.from({ length: count }, (_, index) => index));
  for (const offset of new Set(map.map)) {
    const rect = map.findCell(offset);
    const start = leaving?.axis === 'row' ? rect.top : rect.left;
    if (leaving && start >= leaving.from && start < leaving.to) continue;
    if (isHeader(table.nodeAt(offset))) continue;
    const [first, end] = axis === 'row' ? [rect.top, rect.bottom] : [rect.left, rect.right];
    for (let line = first; line < end; line += 1) lines.delete(line);
  }
  return lines;
}

// Whether a cell covers one of some lines of an axis.
function covers(
  rect: { top: number; bottom: number; left: number; right: number },
  axis: TableAxis,
  lines: ReadonlySet<number>,
) {
  const [first, end] = axis === 'row' ? [rect.top, rect.bottom] : [rect.left, rect.right];
  for (let line = first; line < end; line += 1) if (lines.has(line)) return true;
  return false;
}

/**
 * Gives the cells that start in some new rows or columns of the table at `pos` their type: a
 * header cell inside the leading header rows (columns) given, or across a row (column) of header
 * cells only, and a plain cell elsewhere.
 */
export function applyHeaders(
  tr: Transaction,
  { pos, headers }: { pos: number; headers: TableHeaders },
  lines: TableLines,
): void {
  const table = tr.doc.nodeAt(pos);
  const { table_cell: plain, table_header: header } = tr.doc.type.schema.nodes;
  if (!table || !plain || !header) return;
  const map = TableMap.get(table);
  const crossing = headerLines(table, across(lines.axis), lines);
  const leading = headers[headerKey(lines.axis)];
  for (const offset of new Set(map.map)) {
    const cell = table.nodeAt(offset);
    const rect = map.findCell(offset);
    const start = lines.axis === 'row' ? rect.top : rect.left;
    if (!cell || start < lines.from || start >= lines.to) continue;
    const type = start < leading || covers(rect, across(lines.axis), crossing) ? header : plain;
    if (cell.type !== type) tr.setNodeMarkup(pos + 1 + offset, type, cell.attrs);
  }
}

// The rows or columns the selection covers in its table, as a first index and the index after.
export function selectedLines(
  axis: TableAxis,
  rect: ReturnType<typeof selectedRect>,
): [first: number, end: number] {
  return axis === 'row' ? [rect.top, rect.bottom] : [rect.left, rect.right];
}

// The cells of a table that cover some of its rows (columns), with their offsets and places.
function cellsIn(table: ProseMirrorNode, axis: TableAxis, lines: ReadonlySet<number>) {
  const map = TableMap.get(table);
  return [...new Set(map.map)].flatMap((offset) => {
    const node = table.nodeAt(offset);
    const rect = map.findCell(offset);
    return node && covers(rect, axis, lines) ? [{ offset, node, rect }] : [];
  });
}

/**
 * Makes the rows (or columns) the selection covers header rows, or, when every cell in them is a
 * header cell already, makes them plain, keeping a header cell where it crosses a column (row) of
 * header cells only. When every column (row) is one, as in a table of header cells only, they all
 * become plain.
 */
export function toggleHeaderLines(axis: TableAxis): Command {
  const toggle: Command = (state, dispatch) => {
    if (!isInTable(state)) return false;
    const rect = selectedRect(state);
    const [first, end] = selectedLines(axis, rect);
    const lines = new Set(Array.from({ length: end - first }, (_, index) => first + index));
    const cells = cellsIn(rect.table, axis, lines);
    const { table_cell: plain, table_header: header } = state.schema.nodes;
    if (!plain || !header) return false;
    if (dispatch) {
      const making = cells.some((cell) => !isHeader(cell.node));
      const other = across(axis);
      const kept = headerLines(rect.table, other, { axis, from: first, to: end });
      const width = other === 'row' ? rect.map.height : rect.map.width;
      const keep = kept.size < width ? kept : new Set<number>();
      const tr = state.tr;
      for (const { offset, node, rect: place } of cells) {
        const type = making || covers(place, other, keep) ? header : plain;
        if (node.type !== type) tr.setNodeMarkup(rect.tableStart + offset, type, node.attrs);
      }
      dispatch(tr);
    }
    return true;
  };
  return (state, dispatch, view) => {
    const found = findTable(state.selection.$from);
    return found ? toggle(state, dispatch, view) : false;
  };
}
