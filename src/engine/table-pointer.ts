// Tables under the pointer: a Ctrl or Cmd click selects the cell clicked, or grows the cells
// selected in the same table to it, and dragging a row's bottom border sets the row's height.

import { type Command, Plugin, PluginKey } from 'prosemirror-state';
import { CellSelection, TableMap } from 'prosemirror-tables';
import type { EditorView } from 'prosemirror-view';

/** The nearest a row can be dragged to, in pixels. */
export const MIN_ROW_HEIGHT = 16;

// How close to a cell's bottom border a press starts a row drag, in pixels.
const BORDER_GRAB = 4;

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

// Drags a row's bottom border, setting its height once the pointer is released. The document may
// change under the drag, as a collaborator's edit does, so the row is where the cell pressed is at
// the release; a cell no longer drawn sets nothing.
function dragRow(view: EditorView, event: MouseEvent, pressed: Element) {
  const owner = view.dom.ownerDocument;
  const start = event.clientY;
  const height = pressed.getBoundingClientRect().height;
  const done = (up: MouseEvent) => {
    owner.removeEventListener('mouseup', done);
    const cell = view.isDestroyed ? null : cellAt(view, pressed);
    if (!cell || Math.abs(up.clientY - start) <= 1) return;
    setRowHeight(cell.table, cell.row, height + up.clientY - start)(view.state, view.dispatch);
  };
  owner.addEventListener('mouseup', done);
}

/** Selects cells with Ctrl or Cmd clicks and sets row heights by dragging their bottom border. */
export function createTablePointer(): Plugin {
  return new Plugin({
    key: new PluginKey('table-pointer'),
    props: {
      handleDOMEvents: {
        mousedown(view, event) {
          if (event.button !== 0 || !view.editable) return false;
          const cell = cellAt(view, event.target);
          if (!cell) return false;
          // A Ctrl click on a reference follows it instead.
          const onReference = (event.target as Element).closest?.('[data-reference]');
          if ((event.ctrlKey || event.metaKey) && !onReference) {
            event.preventDefault();
            return selectCellTo(cell.pos)(view.state, view.dispatch);
          }
          const { bottom } = cell.element.getBoundingClientRect();
          if (bottom - event.clientY > BORDER_GRAB || event.clientY > bottom) return false;
          event.preventDefault();
          dragRow(view, event, cell.element);
          return true;
        },
      },
    },
  });
}
