// Column widths dragged by the cell borders. Dragging the border between two columns trades width
// between them, so the table keeps its width; dragging the last column's right border widens or
// narrows the table, never past the content the table sits in. A table fitted to the page width
// leaves the fit when one of its columns is resized, at the widths it was laid out at.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type Command, type EditorState, Plugin, PluginKey } from 'prosemirror-state';
import { cellAround, TableMap } from 'prosemirror-tables';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { inWholeTable } from './table-parts.js';
import { DEFAULT_TABLE_CELL_MIN_WIDTH } from './tables.js';

// How close to a cell's side border the pointer picks the border, in pixels.
const HANDLE_WIDTH = 5;

/** The cell whose right border the pointer is on, or -1, and whether it is being dragged. */
interface ResizeState {
  readonly handle: number;
  readonly dragging: boolean;
}

const resizeKey = new PluginKey<ResizeState>('table-column-resize');

/** A drag of a column's right border. */
export interface ColumnResize {
  /** The column whose right border moves. */
  readonly column: number;
  /** How far the border moves, in pixels. */
  readonly by: number;
  /** The widest the table may be, in pixels. */
  readonly max: number;
}

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);

/**
 * The column widths after a border moves: the column before it and the one after trade width, no
 * narrower than `DEFAULT_TABLE_CELL_MIN_WIDTH`; the last column's border changes the table's width,
 * within `max`.
 */
export function resizeColumns(widths: readonly number[], resize: ColumnResize): number[] {
  const { column, by, max } = resize;
  const min = DEFAULT_TABLE_CELL_MIN_WIDTH;
  const next = [...widths];
  const width = widths[column] ?? 0;
  const following = widths[column + 1];
  if (following === undefined) {
    const others = widths.reduce((sum, each) => sum + each, 0) - width;
    next[column] = clamp(width + by, min, Math.max(min, max - others));
  } else {
    const pair = width + following;
    next[column] = clamp(width + by, min, Math.max(min, pair - min));
    next[column + 1] = pair - (next[column] ?? 0);
  }
  return next.map(Math.round);
}

// The table holding the cell at `cellPos`, with its position and the column the cell ends in.
function tableOfCell(state: EditorState, cellPos: number) {
  const $cell = state.doc.resolve(cellPos);
  const table = $cell.node(-1);
  const start = $cell.start(-1);
  const map = TableMap.get(table);
  const cell = state.doc.nodeAt(cellPos);
  const column = map.colCount(cellPos - start) + Number(cell?.attrs.colspan ?? 1) - 1;
  return { table, pos: start - 1, map, column };
}

// The cell whose right border is under the pointer, or -1.
function borderAt(view: EditorView, event: MouseEvent): number {
  const target = (event.target as Element | null)?.closest?.('td, th');
  if (!target || !view.dom.contains(target)) return -1;
  const { left, right } = target.getBoundingClientRect();
  const onRight = right - event.clientX <= HANDLE_WIDTH;
  if (!onRight && event.clientX - left > HANDLE_WIDTH) return -1;
  // Looks a little inside the cell, so the position is the cell's and not its neighbour's.
  const inside = event.clientX + (onRight ? -HANDLE_WIDTH : HANDLE_WIDTH);
  const found = view.posAtCoords({ left: inside, top: event.clientY });
  const $cell = found && cellAround(view.state.doc.resolve(found.pos));
  if (!$cell) return -1;
  if (onRight) return $cell.pos;
  // On a left border: the cell before it, in the same row.
  const map = TableMap.get($cell.node(-1));
  const start = $cell.start(-1);
  const index = map.map.indexOf($cell.pos - start);
  return index % map.width === 0 ? -1 : start + (map.map[index - 1] ?? 0);
}

// The widths a table's columns are laid out at: a column's set width, or the width of a cell that
// covers only it.
function laidOutWidths(view: EditorView, at: ReturnType<typeof tableOfCell>): number[] {
  const { table, pos, map } = at;
  return Array.from({ length: map.width }, (_, column) => {
    for (let row = 0; row < map.height; row += 1) {
      const offset = map.map[row * map.width + column] ?? 0;
      const cell = table.nodeAt(offset);
      if (Number(cell?.attrs.colspan) !== 1) continue;
      const dom = view.nodeDOM(pos + 1 + offset) as Element | null;
      const width = dom?.getBoundingClientRect?.().width ?? 0;
      if (width > 0) return Math.round(width);
    }
    return DEFAULT_TABLE_CELL_MIN_WIDTH;
  });
}

// The width of the content box the table sits in, or no limit when it cannot be told.
function roomFor(table: Element | null): number {
  const parent = table?.parentElement;
  if (!parent) return Infinity;
  const style = parent.ownerDocument.defaultView?.getComputedStyle(parent);
  const padding = parseFloat(style?.paddingLeft ?? '0') + parseFloat(style?.paddingRight ?? '0');
  const room = parent.clientWidth - padding;
  return room > 0 ? room : Infinity;
}

// Shows column widths while a border is dragged, on the table's column group.
function showWidths(table: HTMLElement, widths: readonly number[]): void {
  const columns = table.querySelectorAll(':scope > colgroup > col');
  widths.forEach((width, index) => {
    const col = columns[index] as HTMLElement | undefined;
    if (col) col.style.width = `${String(width)}px`;
  });
  table.style.width = `${String(widths.reduce((sum, width) => sum + width, 0))}px`;
}

// The whole table a resize runs on: the one at `pos`, or, once the pages its parts sat on joined,
// the table with its id.
function wholeTable(doc: ProseMirrorNode, pos: number, id: unknown) {
  const node = doc.nodeAt(pos);
  if (node?.type.spec.tableRole === 'table' && (!id || node.attrs.dataId === id)) {
    return { node, pos };
  }
  let found: { node: ProseMirrorNode; pos: number } | null = null;
  doc.descendants((each, at) => {
    if (found) return false;
    if (each.type.spec.tableRole === 'table' && each.attrs.dataId === id)
      found = { node: each, pos: at };
    return !each.isTextblock;
  });
  return found;
}

/**
 * Sets the column widths of the table at `table`, on each of its cells, and ends its fit to the
 * page width, aligning it left; on the whole table when the pages split it.
 */
export function setColumnWidths(table: number, widths: readonly number[]): Command {
  return (state, dispatch, view) => {
    const node = state.doc.nodeAt(table);
    if (node?.type.spec.tableRole !== 'table') return false;
    const id = node.attrs.dataId as unknown;
    const set: Command = (inner, done) => {
      const found = wholeTable(inner.doc, table, id);
      if (!found) return false;
      const tr = inner.tr;
      if (found.node.attrs.objectLayout === 'fit-page-width') {
        tr.setNodeMarkup(found.pos, undefined, { ...found.node.attrs, objectLayout: 'left' });
      }
      found.node.forEach((row, rowOffset) => {
        let column = 0;
        row.forEach((cell, cellOffset) => {
          const span = Number(cell.attrs.colspan) || 1;
          const colwidth = widths.slice(column, column + span);
          column += span;
          tr.setNodeMarkup(found.pos + 2 + rowOffset + cellOffset, undefined, {
            ...cell.attrs,
            colwidth,
          });
        });
      });
      done?.(tr);
      return true;
    };
    return inWholeTable(table, set)(state, dispatch, view);
  };
}

// Drags the right border of the cell at `handle` until the pointer is released.
function dragBorder(view: EditorView, event: MouseEvent, handle: number): void {
  const at = tableOfCell(view.state, handle);
  const dom = view.nodeDOM(at.pos) as HTMLElement | null;
  if (!dom) return;
  const start = laidOutWidths(view, at);
  const resize = { column: at.column, max: roomFor(dom) };
  const shown = {
    table: dom.getAttribute('style'),
    columns: Array.from(dom.querySelectorAll(':scope > colgroup > col'), (col) =>
      col.getAttribute('style'),
    ),
  };
  const owner = view.dom.ownerDocument;
  const widthsAt = (x: number) => resizeColumns(start, { ...resize, by: x - event.clientX });
  const move = (moved: MouseEvent) => showWidths(dom, widthsAt(moved.clientX));
  const finish = (up: MouseEvent) => {
    owner.removeEventListener('mousemove', move);
    owner.removeEventListener('mouseup', finish);
    view.dispatch(view.state.tr.setMeta(resizeKey, { handle: -1, dragging: false }));
    if (Math.abs(up.clientX - event.clientX) >= 1) {
      setColumnWidths(at.pos, widthsAt(up.clientX))(view.state, view.dispatch, view);
      return;
    }
    // Nothing changed, so the document draws nothing again: put back what the drag showed.
    if (shown.table === null) dom.removeAttribute('style');
    else dom.setAttribute('style', shown.table);
    dom.querySelectorAll(':scope > colgroup > col').forEach((col, index) => {
      const style = shown.columns[index];
      if (style == null) col.removeAttribute('style');
      else col.setAttribute('style', style);
    });
  };
  owner.addEventListener('mousemove', move);
  owner.addEventListener('mouseup', finish);
  view.dispatch(view.state.tr.setMeta(resizeKey, { handle, dragging: true }));
}

// The handle drawn on the right border of each cell of the column the pointer is on.
function handleDecorations(state: EditorState, handle: number): DecorationSet {
  const { table, pos, map, column } = tableOfCell(state, handle);
  const decorations: Decoration[] = [];
  const seen = new Set<number>();
  for (let row = 0; row < map.height; row += 1) {
    const offset = map.map[row * map.width + column] ?? 0;
    const next = map.map[row * map.width + column + 1];
    if (seen.has(offset) || (column < map.width - 1 && next === offset)) continue;
    seen.add(offset);
    const cell = table.nodeAt(offset);
    if (!cell) continue;
    const marker = (view: EditorView) => {
      const element = view.dom.ownerDocument.createElement('div');
      element.className = 'column-resize-handle';
      return element;
    };
    decorations.push(Decoration.widget(pos + 1 + offset + cell.nodeSize - 1, marker));
  }
  return DecorationSet.create(state.doc, decorations);
}

/** Resizes columns by dragging the borders between cells, in pairs. */
export function createColumnResize(): Plugin<ResizeState> {
  return new Plugin<ResizeState>({
    key: resizeKey,
    state: {
      init: () => ({ handle: -1, dragging: false }),
      apply(tr, value) {
        const meta = tr.getMeta(resizeKey) as ResizeState | undefined;
        if (meta) return meta;
        if (value.handle < 0 || !tr.docChanged) return value;
        const handle = tr.mapping.map(value.handle, -1);
        const role = tr.doc.nodeAt(handle)?.type.spec.tableRole;
        return role === 'cell' || role === 'header_cell'
          ? { ...value, handle }
          : { handle: -1, dragging: false };
      },
    },
    props: {
      attributes: (state): Record<string, string> =>
        (resizeKey.getState(state)?.handle ?? -1) >= 0 ? { class: 'resize-cursor' } : {},
      decorations: (state) => {
        const handle = resizeKey.getState(state)?.handle ?? -1;
        return handle >= 0 ? handleDecorations(state, handle) : null;
      },
      handleDOMEvents: {
        mousemove(view, event) {
          const current = resizeKey.getState(view.state);
          if (!view.editable || !current || current.dragging) return false;
          const handle = borderAt(view, event);
          if (handle !== current.handle) {
            view.dispatch(view.state.tr.setMeta(resizeKey, { handle, dragging: false }));
          }
          return false;
        },
        mouseleave(view) {
          const current = resizeKey.getState(view.state);
          if (current && current.handle >= 0 && !current.dragging) {
            view.dispatch(view.state.tr.setMeta(resizeKey, { handle: -1, dragging: false }));
          }
          return false;
        },
        mousedown(view, event) {
          const current = resizeKey.getState(view.state);
          if (!view.editable || event.button !== 0 || !current || current.handle < 0) return false;
          event.preventDefault();
          dragBorder(view, event, current.handle);
          return true;
        },
      },
    },
  });
}
