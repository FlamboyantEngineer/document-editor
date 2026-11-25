// A table's column widths and the room it has as laid out, for a resize to start from: the layout
// engine's on the pages (DOCE-PAGINATION-10.12), else, where the browser lays the table out, as in
// the web layout, as drawn, divided by the view's zoom.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { TableMap } from 'prosemirror-tables';
import type { EditorView } from 'prosemirror-view';
import { objectBoxOf } from '../pagination/object-boxes.js';
import { DEFAULT_TABLE_CELL_MIN_WIDTH } from './tables.js';

/** A table and where it is. */
interface TableAt {
  readonly table: ProseMirrorNode;
  /** The position before it. */
  readonly pos: number;
  readonly map: TableMap;
}

/**
 * How many screen pixels one CSS pixel of the view takes, such as under the editor's zoom, so a
 * pointer's movement converts to the document's pixels.
 */
export function pointerScale(view: EditorView): number {
  const width = view.dom.offsetWidth;
  if (!width) return 1;
  const scale = view.dom.getBoundingClientRect().width / width;
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

// The widths a table's columns are drawn at: the width of a cell that covers only the column.
function drawnWidths(view: EditorView, { table, pos, map }: TableAt): number[] {
  return Array.from({ length: map.width }, (_, column) => {
    for (let row = 0; row < map.height; row += 1) {
      const offset = map.map[row * map.width + column] ?? 0;
      const cell = table.nodeAt(offset);
      if (Number(cell?.attrs.colspan) !== 1) continue;
      const dom = view.nodeDOM(pos + 1 + offset) as Element | null;
      const width = dom?.getBoundingClientRect?.().width ?? 0;
      if (width > 0) return Math.round(width / pointerScale(view));
    }
    return DEFAULT_TABLE_CELL_MIN_WIDTH;
  });
}

/** The widths a table's columns are laid out at, in whole pixels. */
export function laidOutWidths(view: EditorView, at: TableAt): number[] {
  const box = objectBoxOf(view, at.pos);
  if (box?.kind === 'table' && box.columns.length === at.map.width) {
    return box.columns.map((width) => Math.round(width));
  }
  return drawnWidths(view, at);
}

/** The widths the columns of the table at a position before it are laid out at, in pixels. */
export function laidOutColumnWidths(view: EditorView, table: number): number[] | null {
  const node = view.state.doc.nodeAt(table);
  if (node?.type.spec.tableRole !== 'table') return null;
  return laidOutWidths(view, { table: node, pos: table, map: TableMap.get(node) });
}

/**
 * The width of the content box a table sits in, which its last column's border may widen it to;
 * no limit when it cannot be told.
 */
export function roomFor(view: EditorView, at: { pos: number }, table: Element | null): number {
  const box = objectBoxOf(view, at.pos);
  if (box?.kind === 'table') return box.room;
  const parent = table?.parentElement;
  if (!parent) return Infinity;
  const style = parent.ownerDocument.defaultView?.getComputedStyle(parent);
  const padding = parseFloat(style?.paddingLeft ?? '0') + parseFloat(style?.paddingRight ?? '0');
  const room = parent.clientWidth - padding;
  return room > 0 ? room : Infinity;
}
