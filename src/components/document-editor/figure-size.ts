// A figure's size as the figure dialog sets it: a new width or height, the other side following in
// the drawing's proportions while they are locked, clamped to the sizes a page holds.

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
export interface FigureSizing {
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

/**
 * The size after the writer sets one side: locked with a known ratio, the other side follows in
 * its proportions, and clearing a side clears both; then the size is clamped (`clampFigureSize`).
 */
export function resizeFigure(
  size: FigureSize,
  change: { readonly side: 'width' | 'height'; readonly value: number | null },
  sizing: FigureSizing,
): FigureSize {
  const { side, value } = change;
  const { locked, ratio } = sizing;
  if (!locked || !ratio) return clampFigureSize({ ...size, [side]: value }, sizing);
  if (value === null) return { width: null, height: null };
  const width = side === 'width' ? value : value * ratio;
  return clampFigureSize({ width, height: width / ratio }, sizing);
}
