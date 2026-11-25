// A figure's size as the figure and resize dialogs set it: a new width or height, the other side
// following in the drawing's proportions while they are locked, clamped to the sizes a page holds,
// or, in the resize dialog, checked against them.

import { NodeSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { contentRoomOf, objectBoxOf } from '../../pagination/object-boxes.js';
import type { FigureSizeProblem } from './figure-labels.js';

/** A figure's width and height in pixels; null for a side that follows the drawing. */
export interface FigureSize {
  readonly width: number | null;
  readonly height: number | null;
}

/** The smallest side and the largest width and height a figure takes, in pixels. */
export interface FigureBounds {
  readonly min: number;
  readonly maxWidth: number;
  readonly maxHeight: number;
}

/** How a size changes: whether the sides keep their proportions, and the width over the height. */
interface FigureSizing {
  readonly locked: boolean;
  /** The drawing's width over its height; null while it is unknown. */
  readonly ratio: number | null;
  readonly bounds: FigureBounds;
}

/** The bounds a figure takes without a page to fit: 16 to 2000 pixels a side. */
export const FIGURE_BOUNDS: FigureBounds = { min: 16, maxWidth: 2000, maxHeight: 2000 };

const clampSide = (value: number, min: number, max: number) =>
  Math.round(Math.min(Math.max(value, min), Math.max(min, max)));

/** The width over the height of a size with both sides, or null. */
export function sizeRatio(size: {
  readonly width?: number | null | undefined;
  readonly height?: number | null | undefined;
}): number | null {
  const { width, height } = size;
  return width && height && width > 0 && height > 0 ? width / height : null;
}

/**
 * A size within its bounds. Locked with a known ratio, it scales as a whole, so it keeps its
 * proportions: up to the smallest side, then down to the largest width and height, the largest
 * winning when a narrow drawing cannot meet both. Otherwise each side is clamped on its own. A
 * missing side stays missing.
 */
export function clampFigureSize(size: FigureSize, { locked, ratio, bounds }: FigureSizing) {
  const { width, height } = size;
  if (!locked || !ratio || width === null || height === null) {
    return {
      width: width === null ? null : clampSide(width, bounds.min, bounds.maxWidth),
      height: height === null ? null : clampSide(height, bounds.min, bounds.maxHeight),
    };
  }
  let next = { width, height: width / ratio };
  const grow = Math.max(1, bounds.min / next.width, bounds.min / next.height);
  next = { width: next.width * grow, height: next.height * grow };
  const shrink = Math.min(1, bounds.maxWidth / next.width, bounds.maxHeight / next.height);
  next = { width: next.width * shrink, height: next.height * shrink };
  return { width: Math.round(next.width), height: Math.round(next.height) };
}

// The widest a figure at the selection may be: on the pages, the width of the place the engine
// laid the figure selected out in, or the section's page content (DOCE-PAGINATION-10.12); where
// the browser lays the document out, the document's width.
function contentWidth(view: EditorView): number {
  const { selection } = view.state;
  const box = selection instanceof NodeSelection ? objectBoxOf(view, selection.from) : null;
  if (box?.kind === 'figure') return box.room;
  return contentRoomOf(view, selection.from) ?? view.dom.clientWidth;
}

/** The bounds a figure takes on the document's pages: no wider than their content. */
export function figureBounds(view: EditorView, bounds: FigureBounds = FIGURE_BOUNDS): FigureBounds {
  const content = Math.floor(contentWidth(view));
  return content > 0 ? { ...bounds, maxWidth: Math.min(bounds.maxWidth, content) } : bounds;
}

/** The bounds the resize dialog checks: whole pixels from 1, as wide as the page content. */
export const RESIZE_BOUNDS: FigureBounds = {
  min: 1,
  maxWidth: FIGURE_BOUNDS.maxWidth,
  maxHeight: Infinity,
};

/** Why a side the writer typed is refused, or null for a whole number within the bounds. */
export function figureSideProblem(
  side: 'width' | 'height',
  value: number | null,
  bounds: FigureBounds,
): FigureSizeProblem | null {
  if (value === null) return null;
  if (!Number.isInteger(value)) return { side, kind: 'whole', limit: bounds.min };
  if (value < bounds.min) return { side, kind: 'min', limit: bounds.min };
  const max = side === 'width' ? bounds.maxWidth : bounds.maxHeight;
  return value > max ? { side, kind: 'max', limit: max } : null;
}

/**
 * The size after the writer types one side in the resize dialog: locked with a known ratio, the
 * other side follows in its proportions, rounded to whole pixels; nothing is clamped, so a size
 * out of bounds stays as typed for the dialog to explain.
 */
export function typeFigureSide(
  size: FigureSize,
  change: { readonly side: 'width' | 'height'; readonly value: number | null },
  { locked, ratio }: { readonly locked: boolean; readonly ratio: number | null },
): FigureSize {
  const { side, value } = change;
  if (!locked || !ratio || value === null) return { ...size, [side]: value };
  return side === 'width'
    ? { width: value, height: Math.max(1, Math.round(value / ratio)) }
    : { width: Math.max(1, Math.round(value * ratio)), height: value };
}
