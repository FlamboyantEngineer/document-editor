// Table formatting: aligning the selected cells' content, giving a table's columns equal widths,
// and inserting as many rows or columns as the selection spans.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type Command, type EditorState, Selection, type Transaction } from 'prosemirror-state';
import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  CellSelection,
  findTable,
  isInTable,
  selectedRect,
} from 'prosemirror-tables';
import { inWholeTable } from './table-parts.js';

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

// Runs a command as many times as given, as one transaction.
function repeated(command: Command, times: number): Command {
  return (state, dispatch, view) => {
    let current = state;
    const tr = state.tr;
    for (let index = 0; index < times; index += 1) {
      let next: Transaction | null = null;
      if (!command(current, (step) => (next = step), view) || !next) break;
      for (const step of (next as Transaction).steps) tr.step(step);
      current = current.apply(next);
    }
    if (!tr.docChanged) return false;
    tr.setSelection(Selection.fromJSON(tr.doc, current.selection.toJSON()));
    dispatch?.(tr.scrollIntoView());
    return true;
  };
}

/**
 * Inserts rows above or below the selection, or columns before or after it, as many as the
 * selection spans.
 */
export function insertTableLines(axis: 'row' | 'column', side: 'before' | 'after'): Command {
  const single = {
    row: { before: addRowBefore, after: addRowAfter },
    column: { before: addColumnBefore, after: addColumnAfter },
  }[axis][side];
  return (state, dispatch, view) => {
    if (!isInTable(state)) return false;
    const rect = selectedRect(state);
    const span = axis === 'row' ? rect.bottom - rect.top : rect.right - rect.left;
    const command = repeated(single, Math.max(1, span));
    const found = findTable(state.selection.$from);
    return found
      ? inWholeTable(found.pos, command)(state, dispatch, view)
      : command(state, dispatch, view);
  };
}
