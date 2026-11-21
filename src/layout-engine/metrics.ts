// The font measures the engine needs beside line breaking: a text's width, for generated content
// such as a paragraph's number, and the strut a line box grows from when an inline atom is taller
// than the text, as Chromium's line box does.

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

function fontMetrics(font: string, size: number): Strut {
  const context = new OffscreenCanvas(1, 1).getContext('2d');
  if (context) context.font = font;
  const metrics = context?.measureText('x');
  const ascent = metrics?.fontBoundingBoxAscent;
  const descent = metrics?.fontBoundingBoxDescent;
  if (typeof ascent === 'number' && typeof descent === 'number')
    return { ascent: Math.round(ascent), descent: Math.round(descent) };
  return {
    ascent: Math.round(size * FALLBACK_ASCENT),
    descent: Math.round(size * (1 - FALLBACK_ASCENT)),
  };
}

/**
 * A block's strut: its font's ascent and descent, rounded to whole pixels as Chromium rounds them,
 * with half the rest of the leading above and half below.
 */
export function strutOf(font: string, size: number, leading: number): Strut {
  const { ascent, descent } = fontMetrics(font, size);
  const half = (leading - ascent - descent) / 2;
  return { ascent: ascent + half, descent: leading - ascent - half };
}
