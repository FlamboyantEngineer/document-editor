// The font measures the engine needs beside line breaking: a text's width, for generated content
// such as a paragraph's number, and the struts a line box is built from, the block's and those of
// text in other fonts on the line, as Chromium's line box is.

import { measureNaturalWidth, prepare } from '@chenglou/pretext';

/** The part of a line box above and below its baseline. */
export interface Strut {
  readonly ascent: number;
  readonly descent: number;
}

/** The share of a font's size above the baseline when Canvas gives no font metrics. */
const FALLBACK_ASCENT = 0.8;

/** A text's width in a font, spaces included. */
export function textWidth(text: string, font: string): number {
  return measureNaturalWidth(prepare(text, font, { whiteSpace: 'pre-wrap' }));
}

/** A size whose Canvas metrics are a font's own units, so they are exact before rounding. */
const DESIGN_SIZE = 2048;

/** Where font metrics come from: a Canvas-shaped context, the font files' measurer included. */
export type MetricsContext = () => Pick<OffscreenCanvasRenderingContext2D, 'font' | 'measureText'>;

/** Where a line's struts are measured, and at which device pixel ratio they are rounded. */
interface StrutSource {
  /** The context the metrics are read from; a Canvas when not given. */
  readonly context?: MetricsContext | undefined;
  /** The device pixel ratio; 1, the canonical layout's, when not given. */
  readonly scale?: number | undefined;
  /** Whether the text is drawn hinted, so Chromium positions its glyphs at whole pixels at a ratio of 1. */
  readonly hinted?: boolean | undefined;
}

/** Gives a font's strut at a leading; the fonts' metrics are kept. */
type StrutOf = (font: string, size: number, leading: number) => Strut;

function canvasContext() {
  const context = new OffscreenCanvas(1, 1).getContext('2d');
  return context ?? { font: '', measureText: () => ({}) as TextMetrics };
}

/**
 * Measures struts: a font's ascent and descent, rounded to whole device pixels as Chromium rounds
 * them, with half the rest of the leading above, truncated to whole device pixels as Chromium places the
 * baseline, and the rest below.
 */
export function createStruts({
  context = canvasContext,
  scale = 1,
  hinted = false,
}: StrutSource = {}): StrutOf {
  const perPixel = new Map<string, Strut | null>();
  // A font's ascent and descent per pixel of size, from its metrics at the design size.
  const unitsOf = (font: string): Strut | null => {
    const key = font.replace(/\d+(?:\.\d+)?px/, `${String(DESIGN_SIZE)}px`);
    if (perPixel.has(key)) return perPixel.get(key) ?? null;
    const measuring = context();
    measuring.font = key;
    const { fontBoundingBoxAscent: ascent, fontBoundingBoxDescent: descent } =
      measuring.measureText('x') as Partial<TextMetrics>;
    const units =
      typeof ascent === 'number' && typeof descent === 'number'
        ? { ascent: ascent / DESIGN_SIZE, descent: descent / DESIGN_SIZE }
        : null;
    perPixel.set(key, units);
    return units;
  };
  return (font, size, leading) => {
    const { ascent, descent } = fontMetrics(unitsOf(font), size, {
      scale,
      subpixel: !hinted || scale !== 1,
    });
    const half = Math.floor(((leading - ascent - descent) / 2) * scale) / scale;
    return { ascent: ascent + half, descent: leading - ascent - half };
  };
}

// A font's ascent and descent as Chromium's layout takes them: in whole device pixels at the
// ratio `scale`, and, where Chromium positions glyphs at subpixels (unhinted text, as the pages
// draw theirs, or any ratio other than 1), with a pixel moved from the ascent to a descent that
// rounding shortened.
function fontMetrics(
  perPixel: Strut | null,
  size: number,
  { scale, subpixel }: { readonly scale: number; readonly subpixel: boolean },
): Strut {
  const unit = perPixel ?? { ascent: FALLBACK_ASCENT, descent: 1 - FALLBACK_ASCENT };
  const exactDescent = unit.descent * size * scale;
  let ascent = Math.round(unit.ascent * size * scale);
  let descent = Math.round(exactDescent);
  if (subpixel && descent < exactDescent && ascent >= 1) {
    ascent -= 1;
    descent += 1;
  }
  return { ascent: ascent / scale, descent: descent / scale };
}
