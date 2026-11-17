// The size a figure is drawn at on the page, read from its image, so leaving the fit to the page's
// width keeps the size it was fitted at.

import type { EditorView } from 'prosemirror-view';

/** The whole-pixel size the figure at `pos` is drawn at, or null when the view cannot tell. */
export function laidOutFigureSize(
  view: EditorView,
  pos: number,
): { width: number; height: number } | null {
  const dom = view.nodeDOM(pos);
  const image = dom && 'querySelector' in dom ? (dom as Element).querySelector('img, svg') : null;
  if (!image) return null;
  const { width, height } = image.getBoundingClientRect();
  const scale = view.dom.getBoundingClientRect().width / (view.dom.offsetWidth || 1);
  const scaled = scale > 0 ? scale : 1;
  const size = { width: Math.round(width / scaled), height: Math.round(height / scaled) };
  return size.width > 0 && size.height > 0 ? size : null;
}
