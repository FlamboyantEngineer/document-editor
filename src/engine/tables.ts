// Table editing: cell selections, Tab between cells, column widths dragged by their borders, and
// the commands that change a table's rows and columns, including moving a row or column to
// another place in its table, which a drag and the Alt+Shift+arrow keys do.

import { chainCommands } from 'prosemirror-commands';
import { keymap } from 'prosemirror-keymap';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type Command, Plugin, TextSelection, type Transaction } from 'prosemirror-state';
import {
  addRowAfter,
  CellSelection,
  findTable,
  goToNextCell,
  moveTableColumn,
  moveTableRow,
  selectedRect,
  tableEditing,
  TableMap,
} from 'prosemirror-tables';
import { Mapping } from 'prosemirror-transform';
import { TABLE_BORDER_1PX_CLASS } from '../model/index.js';
import { createTableFigure } from '../model/schema/caption-content.js';
import { newBlockRange } from './block-place.js';
import { appendTransaction, captureTransaction } from './table-parts.js';
import { createTablePointer } from './table-pointer.js';
import { createColumnResize } from './table-resize.js';
import { createRowResize } from './table-row-resize.js';
import { isRemoteTransaction } from './transaction-kind.js';

// Where a new block goes, which the table commands share with every block command.
export { newBlockRange } from './block-place.js';

/** A table's rows or its columns. */
export type TableAxis = 'row' | 'column';

/** A row or column of the table at `table`, the position before the table node. */
export interface TableLine {
  readonly table: number;
  readonly axis: TableAxis;
  readonly index: number;
}

export { DEFAULT_TABLE_CELL_MIN_WIDTH } from '../model/layout/column-widths.js';

/** The table node at a position before it, or null. */
function tableAt(doc: ProseMirrorNode, pos: number): ProseMirrorNode | null {
  const node = doc.nodeAt(pos);
  return node?.type.spec.tableRole === 'table' ? node : null;
}

/** How many rows or columns a table has. */
export function tableLineCount(table: ProseMirrorNode, axis: TableAxis): number {
  const map = TableMap.get(table);
  return axis === 'row' ? map.height : map.width;
}

/** A row or a column of a table selected as cells. */
export function selectTableLine(line: TableLine): Command {
  return (state, dispatch) => {
    const table = tableAt(state.doc, line.table);
    if (!table || line.index < 0 || line.index >= tableLineCount(table, line.axis)) return false;
    const [row, column] = line.axis === 'row' ? [line.index, 0] : [0, line.index];
    const cell = TableMap.get(table).positionAt(row, column, table);
    const $cell = state.doc.resolve(line.table + 1 + cell);
    const selection =
      line.axis === 'row' ? CellSelection.rowSelection($cell) : CellSelection.colSelection($cell);
    dispatch?.(state.tr.setSelection(selection));
    return true;
  };
}

// The position of a cell of a row or column that stays when the pages join: a row's first cell,
// and a column's cell in the last row, which a later part never repeats as a header.
function lineCell(doc: ProseMirrorNode, line: TableLine): number | null {
  const table = tableAt(doc, line.table);
  if (!table || line.index < 0 || line.index >= tableLineCount(table, line.axis)) return null;
  const map = TableMap.get(table);
  const [row, column] = line.axis === 'row' ? [line.index, 0] : [map.height - 1, line.index];
  return line.table + 1 + map.positionAt(row, column, table);
}

/**
 * Runs a table command that acts on the cell holding the selection, such as `addRowBefore` or
 * `deleteColumn`, on a row or column, with the table whole, as one change.
 */
export function withTableLine(line: TableLine, command: Command): Command {
  return (state, dispatch, view) => {
    const cell = lineCell(state.doc, line);
    if (cell === null) return false;
    const caret = state.apply(
      state.tr.setSelection(TextSelection.near(state.doc.resolve(cell + 1))),
    );
    const done = dispatch && ((tr: Transaction) => dispatch(appendTransaction(state.tr, tr)));
    return command(caret, done, view);
  };
}

// Moves a row or column of the table in `state` to the index `to`, with the rows or columns a
// merged cell spans, and selects it where it lands.
function moveLine(line: TableLine, to: number): Command {
  return (state, dispatch) => {
    const table = tableAt(state.doc, line.table);
    if (!table || line.index === to || to < 0 || to >= tableLineCount(table, line.axis)) {
      return false;
    }
    // The table commands find their table from the selection, so they run with a caret inside it.
    const inside = TextSelection.near(state.doc.resolve(line.table + 2));
    const within = state.apply(state.tr.setSelection(inside));
    const options = { from: line.index, to, pos: line.table + 1 };
    const move = line.axis === 'row' ? moveTableRow(options) : moveTableColumn(options);
    const moved = captureTransaction(move, within);
    if (!moved) return false;
    dispatch?.(appendTransaction(state.tr, moved).scrollIntoView());
    return true;
  };
}

// Moves the rows or columns the selection covers to the index `target` gives from their first
// index and the index after them.
function moveSelection(axis: TableAxis, target: (first: number, end: number) => number): Command {
  return (state, dispatch, view) => {
    const found = findTable(state.selection.$from);
    if (!found) return false;
    const rect = selectedRect(state);
    const [first, end] = axis === 'row' ? [rect.top, rect.bottom] : [rect.left, rect.right];
    return moveLine({ table: found.pos, axis, index: first }, target(first, end))(
      state,
      dispatch,
      view,
    );
  };
}

/**
 * Moves a row or column of a table to the index `to`, taking the rows or columns a merged cell
 * spans along, and selects it where it lands. Refuses a move that stays in place or lands inside
 * the rows or columns it moves.
 */
export function moveTableLine(line: TableLine, to: number): Command {
  const offset = to - line.index;
  return withTableLine(
    line,
    moveSelection(line.axis, (first) => first + offset),
  );
}

/** Moves the rows or columns the selection covers one place back (-1) or forward (1). */
export function moveSelectedTableLine(axis: TableAxis, direction: -1 | 1): Command {
  const target = (first: number, end: number) => (direction < 0 ? first - 1 : end);
  return (state, dispatch, view) => {
    const found = findTable(state.selection.$from);
    if (!found) return false;
    return moveSelection(axis, target)(state, dispatch, view);
  };
}

/**
 * Deletes the table holding the selection with its caption, and puts the caret where it was; false
 * when the selection is in no table.
 */
export const deleteTableWithCaption: Command = (state, dispatch) => {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.spec.tableRole !== 'table') continue;
    // The table's caption goes with it: the node holding both, when it has one.
    const held = depth > 1 && $from.node(depth - 1).type.name === 'table_figure';
    const at = held ? depth - 1 : depth;
    if (dispatch) dispatch(state.tr.delete($from.before(at), $from.after(at)).scrollIntoView());
    return true;
  }
  return false;
};

/**
 * Inserts a table of `rows` rows, the first of header cells, and `columns` columns, with a one pixel
 * border, in place of the empty paragraph holding the caret or after the block holding it, with
 * the caret in its first cell.
 */
export function insertTable({ rows, columns }: { rows: number; columns: number }): Command {
  return (state, dispatch) => {
    const { table, table_row: row, table_cell: cell, table_header: header } = state.schema.nodes;
    const range = newBlockRange(state);
    if (!table || !row || !cell || !header || !range || rows < 1 || columns < 1) return false;
    const attrs = { tableBorderClass: TABLE_BORDER_1PX_CLASS };
    const line = (type: typeof cell) =>
      row.create(
        null,
        Array.from({ length: columns }, () => type.createAndFill() ?? type.create()),
      );
    const lines = [line(header), ...Array.from({ length: rows - 1 }, () => line(cell))];
    const figure = createTableFigure(state.schema, table.create(attrs, lines));
    if (!figure) return false;
    if (dispatch) {
      const tr = state.tr.replaceWith(range.from, range.to, figure);
      // The first cell's paragraph opens after the caption, the table, its row and its cell.
      const caption = figure.firstChild?.nodeSize ?? 0;
      tr.setSelection(TextSelection.near(tr.doc.resolve(range.from + 1 + caption + 4)));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

// Tab in a table's last cell adds a row after it and moves into the row's first cell.
const addRowAtEnd: Command = (state, dispatch) => {
  if (!findTable(state.selection.$from)) return false;
  const added = captureTransaction(addRowAfter, state);
  if (!added) return false;
  // Moving to the next cell only selects, so its selection carries over to the added row.
  const moved = captureTransaction(goToNextCell(1), state.apply(added));
  if (moved) added.setSelection(moved.selection.map(added.doc, new Mapping()));
  dispatch?.(added.scrollIntoView());
  return true;
};

// Tab adds a row only where the writer may change the document: a read-only view, such as a
// historical version or reading mode, only moves between cells.
const addRowWhereEditable: Command = (state, dispatch, view) =>
  view?.editable !== false && addRowAtEnd(state, dispatch, view);

// Inside a table, Tab and Shift-Tab with nowhere to go do nothing: they never reach the document's
// Tab, which would indent a list or change the paragraph's level.
const insideTable: Command = (state) => Boolean(findTable(state.selection.$from));

/** The keys of tables, ahead of the document's own Tab. */
export function tableKeys(): Record<string, Command> {
  return {
    Tab: chainCommands(goToNextCell(1), addRowWhereEditable, insideTable),
    'Shift-Tab': chainCommands(goToNextCell(-1), insideTable),
    'Alt-Shift-ArrowUp': moveSelectedTableLine('row', -1),
    'Alt-Shift-ArrowDown': moveSelectedTableLine('row', 1),
    'Alt-Shift-ArrowLeft': moveSelectedTableLine('column', -1),
    'Alt-Shift-ArrowRight': moveSelectedTableLine('column', 1),
  };
}

/** How table editing tells a remote change. */
export interface TableEditingOptions {
  /** Whether a transaction is a remote change; `isRemoteTransaction` by default. */
  readonly isRemote?: ((tr: Transaction) => boolean) | undefined;
}

// The tables a repair took on that hold no cell at all, such as one a delete across it left with an
// empty row, each with the node holding it (its caption's holder when it has one): the repair can
// only delete such a table, which its holder cannot lose, and the schema puts an empty table back
// in its place, which the repair takes on again after every write, such as its element ids.
function emptyTables(doc: ProseMirrorNode, repair: Transaction): { from: number; to: number }[] {
  const found = new Map<number, number>();
  for (const step of repair.steps) {
    const { from } = step as { from?: number };
    if (from === undefined || from > doc.content.size) continue;
    const table = doc.nodeAt(from);
    if (table?.type.spec.tableRole !== 'table' || TableMap.get(table).width > 0) continue;
    const $at = doc.resolve(from);
    const holder = $at.parent.type.name === 'table_figure' ? $at.depth : null;
    const start = holder === null ? from : $at.before(holder);
    found.set(start, holder === null ? from + table.nodeSize : $at.after(holder));
  }
  return [...found].map(([from, to]) => ({ from, to }));
}

// Cell selections, and the repair that keeps every row as wide as the table, which writes only
// after a change of the writer's own: a remote change carries its sender's repair already. A table
// left with no cell is taken out whole, with its caption, rather than repaired.
function localTableEditing(isRemote: (tr: Transaction) => boolean): Plugin {
  const plugin = tableEditing();
  const repair = plugin.spec.appendTransaction;
  return new Plugin({
    ...plugin.spec,
    appendTransaction: (transactions, before, after) => {
      if (!transactions.some((tr) => !isRemote(tr))) return null;
      const repaired = repair?.(transactions, before, after) ?? null;
      const empty = repaired ? emptyTables(after.doc, repaired) : [];
      if (!empty.length) return repaired;
      const tr = after.tr;
      for (const { from, to } of empty.toReversed()) tr.delete(from, to);
      return tr;
    },
  });
}

/**
 * The plugins that edit tables: column widths dragged by the cell borders in pairs, cell
 * selections and the table keys. They run before the document's keys, so Tab moves between cells in a table.
 */
export function createTableEditing({
  isRemote = isRemoteTransaction,
}: TableEditingOptions = {}): Plugin[] {
  return [
    createColumnResize(),
    createRowResize(),
    localTableEditing(isRemote),
    createTablePointer(),
    keymap(tableKeys()),
  ];
}
