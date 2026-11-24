// Tables under the pointer: a Ctrl or Cmd click selects the cell clicked, or grows the cells
// selected in the same table to it; a click in a cell's padding, outside its content, selects the
// cell, and a double click selects the cell's content as text, or in the padding the whole table.
// An empty cell keeps the caret either way, and a secondary press on selected cells keeps them
// selected. Cells a host's lock covers are never selected as cells.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type Command, Plugin, PluginKey, Selection, TextSelection } from 'prosemirror-state';
import { CellSelection, TableMap } from 'prosemirror-tables';
import type { EditorView } from 'prosemirror-view';
import { isCellLocked } from './table-border-hover.js';

/** The nearest a row can be dragged to, in pixels. */
export const MIN_ROW_HEIGHT = 16;

/**
 * Selects the cell at a position before it, or, when cells of the same table are selected, grows
 * the selection from its anchor cell to it.
 */
export function selectCellTo(cellPos: number): Command {
  return (state, dispatch) => {
    const cell = state.doc.nodeAt(cellPos);
    const role = cell?.type.spec.tableRole;
    if (role !== 'cell' && role !== 'header_cell') return false;
    const $cell = state.doc.resolve(cellPos);
    const { selection } = state;
    const sameTable =
      selection instanceof CellSelection && selection.$anchorCell.node(-1) === $cell.node(-1);
    const next = sameTable
      ? new CellSelection(selection.$anchorCell, $cell)
      : new CellSelection($cell);
    dispatch?.(state.tr.setSelection(next));
    return true;
  };
}

/** Sets the height of the row of the table at `table` with an index, in pixels; null clears it. */
export function setRowHeight(table: number, row: number, height: number | null): Command {
  return (state, dispatch) => {
    const node = state.doc.nodeAt(table);
    if (node?.type.spec.tableRole !== 'table' || row < 0 || row >= node.childCount) return false;
    const value = height === null ? null : Math.max(MIN_ROW_HEIGHT, Math.round(height));
    if (dispatch) {
      const tr = state.tr;
      const map = TableMap.get(node);
      const cells = new Set(
        map.cellsInRect({ left: 0, right: map.width, top: row, bottom: row + 1 }),
      );
      for (const offset of cells) {
        const cell = node.nodeAt(offset);
        if (cell)
          tr.setNodeMarkup(table + 1 + offset, undefined, { ...cell.attrs, rowHeight: value });
      }
      dispatch(tr);
    }
    return true;
  };
}

// The cell element a pointer event is in, with its position, its table's and its row's index.
function cellAt(view: EditorView, target: EventTarget | null) {
  const element = (target as Element | null)?.closest?.('td, th');
  if (!element || !view.dom.contains(element)) return null;
  const inside = view.posAtDOM(element, 0);
  const $inside = view.state.doc.resolve(inside);
  for (let depth = $inside.depth; depth > 0; depth -= 1) {
    const role = $inside.node(depth).type.spec.tableRole;
    if (role !== 'cell' && role !== 'header_cell') continue;
    return {
      element,
      pos: $inside.before(depth),
      table: $inside.before(depth - 2),
      row: $inside.index(depth - 2),
    };
  }
  return null;
}

// Whether a cell holds nothing but one empty paragraph, where a click keeps the caret.
function isEmptyCell(cell: ProseMirrorNode): boolean {
  const only = cell.childCount === 1 ? cell.firstChild : null;
  return Boolean(only?.isTextblock && only.content.size === 0);
}

// Whether a press is in a cell's padding: on the cell itself, or beside its content box, where a
// block drawn on the layout engine's lines reaches with the room its lines are given.
function isInPadding(element: Element, event: MouseEvent): boolean {
  if (event.target === element) return true;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (!style) return false;
  const box = element.getBoundingClientRect();
  // A cell not laid out has no box to press beside.
  if (box.width === 0) return false;
  const start = box.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
  const end = box.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);
  return event.clientX < start || event.clientX > end;
}

// The cell a click or double click is on, when it is not empty and no lock covers it, with whether
// the press is in its padding, outside its content box.
function clickedCell(view: EditorView, event: MouseEvent) {
  const cell = cellAt(view, event.target);
  const node = cell && view.state.doc.nodeAt(cell.pos);
  if (!cell || !node || isEmptyCell(node) || isCellLocked(view.state, cell.pos)) return null;
  return { ...cell, node, inPadding: isInPadding(cell.element, event) };
}

/** Selects the content of the cell at a position before it as text, from its start to its end. */
export function selectCellContent(cellPos: number): Command {
  return (state, dispatch) => {
    const cell = state.doc.nodeAt(cellPos);
    if (!cell || !String(cell.type.spec.tableRole).includes('cell')) return false;
    const start = Selection.findFrom(state.doc.resolve(cellPos + 1), 1, true);
    const end = Selection.findFrom(state.doc.resolve(cellPos + cell.nodeSize - 1), -1, true);
    if (!start || !end) return false;
    dispatch?.(state.tr.setSelection(TextSelection.create(state.doc, start.from, end.to)));
    return true;
  };
}

/** Selects every cell of the table at a position before it. */
export function selectWholeTable(table: number): Command {
  return (state, dispatch) => {
    const node = state.doc.nodeAt(table);
    if (node?.type.spec.tableRole !== 'table') return false;
    const { map } = TableMap.get(node);
    const first = table + 1 + (map[0] ?? 0);
    const last = table + 1 + (map[map.length - 1] ?? 0);
    const $first = state.doc.resolve(first);
    dispatch?.(state.tr.setSelection(new CellSelection($first, state.doc.resolve(last))));
    return true;
  };
}

// A secondary press on a selected cell keeps the cells selected for the menu it opens: the press
// would otherwise move the browser's caret, which the view then takes for its selection.
function keepSelectedCells(view: EditorView, event: MouseEvent): boolean {
  const { selection } = view.state;
  const cell = selection instanceof CellSelection ? cellAt(view, event.target) : null;
  if (!cell) return false;
  let inside = false;
  (selection as CellSelection).forEachCell((_node, pos) => (inside ||= pos === cell.pos));
  if (inside) event.preventDefault();
  return inside;
}

// A cell selection in cells a lock covers falls back to a caret at its head.
function unlockedSelection(state: Parameters<Command>[0]) {
  const { selection } = state;
  if (!(selection instanceof CellSelection) || !isCellLocked(state, selection.$headCell.pos)) {
    return null;
  }
  return state.tr.setSelection(TextSelection.near(state.doc.resolve(selection.$headCell.pos + 1)));
}

/**
 * Selects cells with Ctrl or Cmd clicks and with clicks in their padding, and a cell's content
 * or its whole table with a double click.
 */
export function createTablePointer(): Plugin {
  return new Plugin({
    key: new PluginKey('table-pointer'),
    appendTransaction: (transactions, _before, state) =>
      transactions.some((tr) => tr.selectionSet) ? unlockedSelection(state) : null,
    props: {
      handleDOMEvents: {
        mousedown(view, event) {
          if (event.button === 2) return keepSelectedCells(view, event);
          if (event.button !== 0 || !view.editable || !(event.ctrlKey || event.metaKey)) {
            return false;
          }
          const cell = cellAt(view, event.target);
          // A Ctrl click on a reference follows it instead.
          const onReference = (event.target as Element).closest?.('[data-reference]');
          if (!cell || onReference || isCellLocked(view.state, cell.pos)) return false;
          event.preventDefault();
          return selectCellTo(cell.pos)(view.state, view.dispatch);
        },
      },
      handleClick(view, _pos, event) {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) return false;
        const cell = clickedCell(view, event);
        if (!cell?.inPadding) return false;
        const $cell = view.state.doc.resolve(cell.pos);
        view.dispatch(view.state.tr.setSelection(new CellSelection($cell)));
        return true;
      },
      handleDoubleClick(view, _pos, event) {
        if (event.button !== 0) return false;
        const cell = clickedCell(view, event);
        if (!cell) return false;
        const select = cell.inPadding ? selectWholeTable(cell.table) : selectCellContent(cell.pos);
        return select(view.state, view.dispatch);
      },
    },
  });
}
