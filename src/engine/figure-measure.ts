// The size a figure is laid out at on the page, from the layout engine's box for it, so leaving the
// fit to the page's width keeps the size it was fitted at, the same whoever does it and at whatever
// zoom (DOCE-PAGINATION-10.12).

import type { EditorView } from 'prosemirror-view';
import { objectBoxOf } from '../pagination/object-boxes.js';

const side = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

/**
 * The whole-pixel size the figure at `pos` is laid out at: the engine's image box, or, where the
 * pages are not laid out by the engine, its stored size; null without either.
 */
export function laidOutFigureSize(
  view: EditorView,
  pos: number,
): { width: number; height: number } | null {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'figure') return null;
  const box = objectBoxOf(view, pos);
  const laid =
    box?.kind === 'figure'
      ? box
      : { width: side(node.attrs.width) ?? 0, height: side(node.attrs.height) ?? 0 };
  // Whole pixels no wider than the box, so the size still fits the place it was laid out in, the
  // height following in the box's proportions.
  const width = Math.floor(laid.width);
  const height = laid.width > 0 ? Math.round((laid.height * width) / laid.width) : 0;
  const size = { width, height };
  return size.width > 0 && size.height > 0 ? size : null;
}
