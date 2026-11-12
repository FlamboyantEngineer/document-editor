// Table formatting: aligning the selected cells' content, giving a table's columns equal widths,
// giving rows one height, and inserting as many rows or columns as the selection spans, keeping the header rows and
// columns leading.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Command, EditorState, Transaction } from 'prosemirror-state';
import {
  addColumn,
  addRow,
  CellSelection,
  findTable,
  isInTable,
  selectedRect,
  TableMap,
} from 'prosemirror-tables';
import { Transform } from 'prosemirror-transform';
import type { EditorView } from 'prosemirror-view';
import { applyHeaders, headerKey, selectedLines, tableHeaders } from './table-headers.js';
import { inWholeTable } from './table-parts.js';
import { MIN_ROW_HEIGHT } from './table-pointer.js';
import type { TableAxis } from './tables.js';

/** How a cell's content sits across it. */
export type CellTextAlign = 'left' | 'center' | 'right';
/** How a cell's content sits down it. */
export type CellVerticalAlign = 'top' | 'middle' | 'bottom';

// The cells the selection covers, with their positions: the selected cells, or the cell holding
// the caret.
function selectedCells(state: EditorState): { node: ProseMirrorNode; pos: number }[] {
  const { selection } = state;
  if (selection instanceof CellSelection) {
    const cells: { node: ProseMirrorNode; pos: number }[] = [];
    selection.forEachCell((node, pos) => cells.push({ node, pos }));
    return cells;
  }
  const { $from } = selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.spec.tableRole === 'cell' || node.type.spec.tableRole === 'header_cell') {
      return [{ node, pos: $from.before(depth) }];
    }
  }
  return [];
}

/** Aligns the content of the selected cells across, down, or both. */
export function setCellAlignment(align: {
  readonly textAlign?: CellTextAlign | undefined;
  readonly verticalAlign?: CellVerticalAlign | undefined;
}): Command {
  return (state, dispatch) => {
    const cells = selectedCells(state);
    if (cells.length === 0) return false;
    if (dispatch) {
      const tr = state.tr;
      for (const { node, pos } of cells) {
        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          ...(align.textAlign ? { textAlign: align.textAlign } : {}),
          ...(align.verticalAlign ? { verticalAlign: align.verticalAlign } : {}),
        });
      }
      dispatch(tr);
    }
    return true;
  };
}

// The widths of a table's columns, from the cells of its first row; null while one is unset.
function columnWidths(table: ProseMirrorNode): number[] | null {
  const widths: number[] = [];
  const first = table.firstChild;
  if (!first) return null;
  for (let index = 0; index < first.childCount; index += 1) {
    const cell = first.child(index);
    const colwidth = cell.attrs.colwidth as number[] | null;
    const span = Number(cell.attrs.colspan) || 1;
    if (!colwidth || colwidth.length !== span || colwidth.some((width) => !width)) return null;
    widths.push(...colwidth);
  }
  return widths;
}

const distribute: Command = (state, dispatch) => {
  const found = findTable(state.selection.$from);
  if (!found) return false;
  const widths = columnWidths(found.node);
  if (!widths || widths.length < 2) return false;
  const each = Math.floor(widths.reduce((sum, width) => sum + width, 0) / widths.length);
  if (widths.every((width) => width === each)) return false;
  if (dispatch) {
    const tr = state.tr;
    found.node.descendants((cell, offset) => {
      if (cell.type.spec.tableRole !== 'cell' && cell.type.spec.tableRole !== 'header_cell') {
        return true;
      }
      const span = Number(cell.attrs.colspan) || 1;
      tr.setNodeMarkup(found.start + offset, undefined, {
        ...cell.attrs,
        colwidth: Array.from({ length: span }, () => each),
      });
      return false;
    });
    dispatch(tr);
  }
  return true;
};

/** Gives the columns of the table at the selection equal widths, keeping the table's width. */
export const distributeColumns: Command = (state, dispatch, view) => {
  const found = findTable(state.selection.$from);
  if (!found) return false;
  return inWholeTable(found.pos, distribute)(state, dispatch, view);
};

// The rows the selection covers when it spans more than one, or every row of its table.
function rowsToDistribute(state: EditorState): { from: number; to: number } | null {
  if (!isInTable(state)) return null;
  const rect = selectedRect(state);
  const spans = state.selection instanceof CellSelection && rect.bottom - rect.top > 1;
  return spans ? { from: rect.top, to: rect.bottom } : { from: 0, to: rect.map.height };
}

// The height of each of some rows: its cells' set height, or its height as laid out in the view.
function rowHeights(state: EditorState, view: EditorView | undefined): number[] {
  const rows = rowsToDistribute(state);
  const found = findTable(state.selection.$from);
  if (!rows || !found) return [];
  const heights: number[] = [];
  const pos = found.start;
  found.node.forEach((row, offset, index) => {
    if (index < rows.from || index >= rows.to) return;
    const set = row.firstChild?.attrs.rowHeight as number | null | undefined;
    const dom = view?.nodeDOM(pos + offset) as Element | null | undefined;
    const laidOut = dom?.getBoundingClientRect?.().height ?? 0;
    heights.push(set || Math.round(laidOut));
  });
  return heights;
}

// Sets the rows the selection covers, or every row of its table, to a height.
const setRowsHeight =
  (height: number): Command =>
  (state, dispatch) => {
    const rows = rowsToDistribute(state);
    if (!rows) return false;
    if (dispatch) {
      const rect = selectedRect(state);
      const tr = state.tr;
      const area = { left: 0, right: rect.map.width, top: rows.from, bottom: rows.to };
      for (const offset of rect.map.cellsInRect(area)) {
        const cell = rect.table.nodeAt(offset);
        if (cell)
          tr.setNodeMarkup(rect.tableStart + offset, undefined, {
            ...cell.attrs,
            rowHeight: height,
          });
      }
      dispatch(tr);
    }
    return true;
  };

/**
 * Gives the rows the selection covers, or every row of its table, one height: the average of
 * their heights. Refused while a row has no height or the heights are equal already.
 */
export const distributeRows: Command = (state, dispatch, view) => {
  const found = findTable(state.selection.$from);
  const heights = rowHeights(state, view);
  if (!found || heights.length < 2 || heights.some((height) => !(height > 0))) return false;
  const height = Math.max(
    MIN_ROW_HEIGHT,
    Math.round(heights.reduce((sum, each) => sum + each, 0) / heights.length),
  );
  if (heights.every((each) => each === height)) return false;
  return inWholeTable(found.pos, setRowsHeight(height))(state, dispatch, view);
};

/**
 * Inserts rows above or below the selection, or columns before or after it, as many as the
 * selection spans, keeping the headers: a row or column inserted before a header one is a header,
 * any other is not, and its cells in a header column or row are header cells.
 */
export function insertTableLines(axis: TableAxis, side: 'before' | 'after'): Command {
  const insert: Command = (state, dispatch) => {
    if (!isInTable(state)) return false;
    const rect = selectedRect(state);
    const [first, end] = selectedLines(axis, rect);
    const count = Math.max(1, end - first);
    const at = side === 'before' ? first : end;
    const headers = tableHeaders(rect.table);
    if (dispatch) {
      const tr = state.tr;
      const tablePos = rect.tableStart - 1;
      // Each insert is one transform of its own: the table commands map their positions through
      // the steps of the transform they write to.
      let doc = state.doc;
      for (let index = 0; index < count; index += 1) {
        const table = doc.nodeAt(tablePos);
        if (!table) break;
        const step = new Transform(doc);
        const current = { ...rect, map: TableMap.get(table), table };
        if (axis === 'row') addRow(step as Transaction, current, at);
        else addColumn(step as Transaction, current, at);
        for (const each of step.steps) tr.step(each);
        doc = step.doc;
      }
      const key = headerKey(axis);
      const grown = at < headers[key] ? { ...headers, [key]: headers[key] + count } : headers;
      applyHeaders(tr, { pos: tablePos, headers: grown }, { axis, from: at, to: at + count });
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
  return (state, dispatch, view) => {
    const found = findTable(state.selection.$from);
    return found ? inWholeTable(found.pos, insert)(state, dispatch, view) : false;
  };
}
