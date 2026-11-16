// Tables under the pointer: a Ctrl or Cmd click selects the cell clicked, or grows the cells
// selected in the same table to it, and dragging a row's bottom border sets the row's height.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type Command, Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import { CellSelection, TableMap } from 'prosemirror-tables';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { createTableDrag, tableScale } from './table-drag.js';

interface RowResizeState {
  readonly handle: number;
  readonly height: number | null;
  readonly preview: DecorationSet;
}

type RowResizeMeta = Pick<RowResizeState, 'handle' | 'height'>;

const pointerKey = new PluginKey<RowResizeState>('table-pointer');

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

function rowAt(doc: ProseMirrorNode, pos: number) {
  const cell = pos >= 0 ? doc.nodeAt(pos) : null;
  if (!cell || !['cell', 'header_cell'].includes(String(cell.type.spec.tableRole))) return null;
  const $cell = doc.resolve(pos);
  return { table: $cell.before($cell.depth - 1), row: $cell.index($cell.depth - 1) };
}

function previewRow(doc: ProseMirrorNode, handle: number, height: number | null): DecorationSet {
  const at = rowAt(doc, handle);
  const table = at ? doc.nodeAt(at.table) : null;
  if (!at || !table || height === null) return DecorationSet.empty;
  const map = TableMap.get(table);
  // A separate property leaves saved inline heights intact when the decoration is removed.
  const style = `--de-table-row-height:${String(height)}px`;
  const cells = map.cellsInRect({ left: 0, right: map.width, top: at.row, bottom: at.row + 1 });
  const decorations = cells.flatMap((offset) => {
    const cell = table.nodeAt(offset);
    const pos = at.table + 1 + offset;
    return cell
      ? [Decoration.node(pos, pos + cell.nodeSize, { class: 'de-table-row-preview', style })]
      : [];
  });
  return DecorationSet.create(doc, decorations);
}

function updatePointer(tr: Transaction, value: RowResizeState): RowResizeState {
  const meta = tr.getMeta(pointerKey) as RowResizeMeta | undefined;
  if (meta) return { ...meta, preview: previewRow(tr.doc, meta.handle, meta.height) };
  if (!tr.docChanged || value.handle < 0) return value;
  const mapped = tr.mapping.mapResult(value.handle, -1);
  const handle = mapped.deleted || !rowAt(tr.doc, mapped.pos) ? -1 : mapped.pos;
  return {
    ...value,
    handle,
    preview: handle < 0 ? DecorationSet.empty : value.preview.map(tr.mapping, tr.doc),
  };
}

function rowBorder(view: EditorView, event: MouseEvent) {
  const cell = cellAt(view, event.target);
  if (!cell) return null;
  const rect = cell.element.getBoundingClientRect();
  // The side borders belong to column resizing, including where two borders meet.
  if (event.clientX <= rect.left + 5 || event.clientX >= rect.right - 5) return null;
  return rect.bottom - event.clientY <= BORDER_GRAB && event.clientY <= rect.bottom ? cell : null;
}

// Preview through decorations, so DOM parsing and Canvas painting see each move without making
// document changes. The one committed change follows the pressed cell through concurrent edits.
function dragRow(
  view: EditorView,
  event: MouseEvent,
  drag: {
    readonly cell: NonNullable<ReturnType<typeof cellAt>>;
    readonly gesture: ReturnType<typeof createTableDrag>;
  },
) {
  const { cell, gesture } = drag;
  const start = event.clientY;
  const scale = tableScale(cell.element as HTMLElement).y;
  const height = cell.element.getBoundingClientRect().height / scale;
  const heightAt = (y: number) =>
    Math.max(MIN_ROW_HEIGHT, Math.round(height + (y - start) / scale));
  const show = (next: number) => {
    const handle = pointerKey.getState(view.state)?.handle ?? -1;
    view.dispatch(view.state.tr.setMeta(pointerKey, { handle, height: next }));
  };
  gesture.start(view, {
    move: (moved) => show(heightAt(moved.clientY)),
    finish(up) {
      const at = rowAt(view.state.doc, pointerKey.getState(view.state)?.handle ?? -1);
      view.dispatch(view.state.tr.setMeta(pointerKey, { handle: -1, height: null }));
      if (at && up && Math.abs(up.clientY - start) > 1)
        setRowHeight(at.table, at.row, heightAt(up.clientY))(view.state, view.dispatch);
    },
  });
  view.dispatch(view.state.tr.setMeta(pointerKey, { handle: cell.pos, height: heightAt(start) }));
}

/** Selects cells with Ctrl or Cmd clicks and sets row heights by dragging their bottom border. */
export function createTablePointer(): Plugin<RowResizeState> {
  const gesture = createTableDrag();
  return new Plugin<RowResizeState>({
    key: pointerKey,
    view: gesture.view,
    state: {
      init: () => ({ handle: -1, height: null, preview: DecorationSet.empty }),
      apply: updatePointer,
    },
    props: {
      attributes: (state): Record<string, string> =>
        (pointerKey.getState(state)?.handle ?? -1) >= 0 ? { class: 'de-table-row-resize' } : {},
      decorations: (state) => pointerKey.getState(state)?.preview ?? null,
      handleDOMEvents: {
        mousemove(view, event) {
          const current = pointerKey.getState(view.state);
          if (!view.editable || !current || current.height !== null) return false;
          const handle = rowBorder(view, event)?.pos ?? -1;
          if (handle !== current.handle)
            view.dispatch(view.state.tr.setMeta(pointerKey, { handle, height: null }));
          return false;
        },
        mouseleave(view) {
          const current = pointerKey.getState(view.state);
          if (current && current.handle >= 0 && current.height === null)
            view.dispatch(view.state.tr.setMeta(pointerKey, { handle: -1, height: null }));
          return false;
        },
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
          if (!rowBorder(view, event)) return false;
          event.preventDefault();
          dragRow(view, event, { cell, gesture });
          return true;
        },
      },
    },
  });
}
