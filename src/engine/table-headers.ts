// A table's header rows and columns: the leading rows and the leading columns whose cells are
// header cells. Making a row or column a header makes the ones before it headers too, and making it
// plain makes the ones after it plain, so the headers stay one block at the start.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Command, Transaction } from 'prosemirror-state';
import { findTable, isInTable, selectedRect, TableMap } from 'prosemirror-tables';
import type { TableAxis } from './tables.js';

/** How many leading rows and leading columns of a table hold only header cells. */
export interface TableHeaders {
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
export interface TableLines {
  readonly axis: TableAxis;
  readonly from: number;
  readonly to: number;
}

export const headerKey = (axis: TableAxis) => (axis === 'row' ? 'rows' : 'columns');

/**
 * Gives the cells that start in some rows or columns of the table at `pos` their type for these
 * headers: a header cell in a header row or a header column, a plain cell elsewhere.
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
  for (const offset of new Set(map.map)) {
    const cell = table.nodeAt(offset);
    const rect = map.findCell(offset);
    const start = lines.axis === 'row' ? rect.top : rect.left;
    if (!cell || start < lines.from || start >= lines.to) continue;
    const type = rect.top < headers.rows || rect.left < headers.columns ? header : plain;
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

/**
 * Makes the rows (or columns) the selection covers header rows, with every row before them, or,
 * when the first of them is a header already, makes it and every row after it plain rows.
 */
export function toggleHeaderLines(axis: TableAxis): Command {
  const toggle: Command = (state, dispatch) => {
    if (!isInTable(state)) return false;
    const rect = selectedRect(state);
    const [first, end] = selectedLines(axis, rect);
    const key = headerKey(axis);
    const headers = tableHeaders(rect.table);
    const count = first < headers[key] ? first : end;
    if (dispatch) {
      const tr = state.tr;
      applyHeaders(
        tr,
        { pos: rect.tableStart - 1, headers: { ...headers, [key]: count } },
        { axis, from: Math.min(count, headers[key]), to: Math.max(count, headers[key]) },
      );
      dispatch(tr);
    }
    return true;
  };
  return (state, dispatch, view) => {
    const found = findTable(state.selection.$from);
    return found ? toggle(state, dispatch, view) : false;
  };
}
