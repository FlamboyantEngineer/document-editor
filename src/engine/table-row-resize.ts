// Row heights dragged by the cell borders. The pointer on a row's bottom border, from the cell
// above it or the cell below, shows the row resize cursor and highlights the border; dragging it
// shows the row at the height it would take, and releasing sets that height on the row.

import { type EditorState, Plugin, PluginKey } from 'prosemirror-state';
import { cellAround, TableMap } from 'prosemirror-tables';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import {
  type BorderState,
  forgetBorderOnScroll,
  isCellLocked,
  NO_BORDER,
} from './table-border-hover.js';
import { MIN_ROW_HEIGHT, setRowHeight } from './table-pointer.js';

// How close to a row's border the pointer picks the border, in pixels.
const BORDER_GRAB = 4;

const rowResizeKey = new PluginKey<BorderState>('table-row-resize');

// The position before the cell an element draws, or -1.
function cellOfElement(view: EditorView, element: Element): number {
  const $inside = view.state.doc.resolve(view.posAtDOM(element, 0));
  const $cell = cellAround($inside);
  return $cell ? $cell.pos : -1;
}

// The cell just above the cell at `below`, in the same column, drawn in the same table element,
// or -1: the last row of a part on the page before is not above the first row of the next part.
function cellAbove(view: EditorView, below: number, element: Element): number {
  const $below = view.state.doc.resolve(below);
  const row = $below.index(-1);
  if (row === 0) return -1;
  const table = $below.node(-1);
  const start = $below.start(-1);
  const map = TableMap.get(table);
  const above = start + map.positionAt(row - 1, map.colCount(below - start), table);
  const drawn = view.nodeDOM(above) as Element | null;
  return drawn?.closest('table') === element.closest('table') ? above : -1;
}

/**
 * The cell whose bottom border the pointer is on, or -1: the cell under the pointer when the
 * pointer is near its bottom, or the cell above it in the same table when it is near its top.
 */
function rowBorderAt(view: EditorView, event: MouseEvent): number {
  const target = (event.target as Element | null)?.closest?.('td, th');
  if (!target || !view.dom.contains(target)) return -1;
  const { top, bottom } = target.getBoundingClientRect();
  const cell = cellOfElement(view, target);
  if (cell < 0) return -1;
  if (bottom - event.clientY <= BORDER_GRAB && event.clientY <= bottom) return cell;
  if (event.clientY - top > BORDER_GRAB || event.clientY < top) return -1;
  return cellAbove(view, cell, target);
}

// The row of the cell at `cellPos`: its table's position and its index, and its cells.
function rowOf(state: EditorState, cellPos: number) {
  const $cell = state.doc.resolve(cellPos);
  const table = $cell.before(-1);
  const node = $cell.node(-1);
  const row = $cell.index(-1);
  const map = TableMap.get(node);
  const cells = [
    ...new Set(map.cellsInRect({ left: 0, right: map.width, top: row, bottom: row + 1 })),
  ];
  return { table, row, cells: cells.map((offset) => table + 1 + offset), node };
}

// The highlight drawn along the bottom border of each cell of the row the pointer is on.
function borderDecorations(state: EditorState, handle: number): DecorationSet {
  const { cells } = rowOf(state, handle);
  const marker = (view: EditorView) => {
    const element = view.dom.ownerDocument.createElement('div');
    element.className = 'de-row-resize-handle';
    return element;
  };
  const decorations = cells.flatMap((pos) => {
    const cell = state.doc.nodeAt(pos);
    return cell ? [Decoration.widget(pos + cell.nodeSize - 1, marker)] : [];
  });
  return DecorationSet.create(state.doc, decorations);
}

// Drags the border below the row of the cell at `handle`, showing the row at its new height,
// until the pointer is released. The row is where the cell is at the release, whatever changed
// meanwhile; a cell no longer drawn sets nothing.
function dragRow(view: EditorView, event: MouseEvent, handle: number): void {
  const pressed = view.nodeDOM(handle) as HTMLElement | null;
  const row = pressed?.parentElement;
  if (!pressed || !row) return;
  const start = event.clientY;
  const height = pressed.getBoundingClientRect().height;
  const style = row.getAttribute('style');
  const owner = view.dom.ownerDocument;
  const heightAt = (y: number) => Math.max(MIN_ROW_HEIGHT, Math.round(height + y - start));
  const move = (moved: MouseEvent) => {
    row.style.height = `${String(heightAt(moved.clientY))}px`;
  };
  const done = (up: MouseEvent) => {
    owner.removeEventListener('mousemove', move);
    owner.removeEventListener('mouseup', done);
    if (style === null) row.removeAttribute('style');
    else row.setAttribute('style', style);
    if (view.isDestroyed) return;
    const at = rowResizeKey.getState(view.state)?.handle ?? -1;
    view.dispatch(view.state.tr.setMeta(rowResizeKey, NO_BORDER));
    if (at < 0 || Math.abs(up.clientY - start) <= 1) return;
    const { table, row: index } = rowOf(view.state, at);
    setRowHeight(table, index, heightAt(up.clientY))(view.state, view.dispatch);
  };
  owner.addEventListener('mousemove', move);
  owner.addEventListener('mouseup', done);
  view.dispatch(view.state.tr.setMeta(rowResizeKey, { handle, dragging: true }));
}

/** Resizes rows by dragging the border below them, from either side of it. */
export function createRowResize(): Plugin<BorderState> {
  return new Plugin<BorderState>({
    key: rowResizeKey,
    state: {
      init: () => NO_BORDER,
      apply(tr, value) {
        const meta = tr.getMeta(rowResizeKey) as BorderState | undefined;
        if (meta) return meta;
        if (value.handle < 0 || !tr.docChanged) return value;
        const handle = tr.mapping.map(value.handle, -1);
        const role = tr.doc.nodeAt(handle)?.type.spec.tableRole;
        return role === 'cell' || role === 'header_cell' ? { ...value, handle } : NO_BORDER;
      },
    },
    view: forgetBorderOnScroll(rowResizeKey),
    props: {
      attributes: (state): Record<string, string> =>
        (rowResizeKey.getState(state)?.handle ?? -1) >= 0 ? { 'data-row-resize': 'true' } : {},
      decorations: (state) => {
        const handle = rowResizeKey.getState(state)?.handle ?? -1;
        return handle >= 0 ? borderDecorations(state, handle) : null;
      },
      handleDOMEvents: {
        mousemove(view, event) {
          const current = rowResizeKey.getState(view.state);
          if (!view.editable || !current || current.dragging) return false;
          const found = rowBorderAt(view, event);
          const handle = found >= 0 && !isCellLocked(view.state, found) ? found : -1;
          if (handle !== current.handle) {
            view.dispatch(view.state.tr.setMeta(rowResizeKey, { handle, dragging: false }));
          }
          return false;
        },
        mouseleave(view) {
          const current = rowResizeKey.getState(view.state);
          if (current && current.handle >= 0 && !current.dragging) {
            view.dispatch(view.state.tr.setMeta(rowResizeKey, NO_BORDER));
          }
          return false;
        },
        mousedown(view, event) {
          if (!view.editable || event.button !== 0 || event.ctrlKey || event.metaKey) return false;
          // A press on a border the pointer has not moved over yet, as a touch gives, finds it.
          const handle = rowResizeKey.getState(view.state)?.handle ?? -1;
          const found = handle >= 0 ? handle : rowBorderAt(view, event);
          if (found < 0 || isCellLocked(view.state, found)) return false;
          event.preventDefault();
          dragRow(view, event, found);
          return true;
        },
      },
    },
  });
}
