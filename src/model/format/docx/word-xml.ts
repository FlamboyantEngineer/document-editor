// The XML a word processing document is written in: its declaration, the namespaces its parts use,
// escaped text, and the units its lengths, sizes and colors are written in.

import { lengthToCssPx } from '../../templates/template-css-values.js';

/** The declaration every part starts with. */
export const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

/** The namespaces of the main document parts; the 2010 and 2012 extensions may be ignored. */
export const WORD_NAMESPACES =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="w14 w15"';

/**
 * Text as XML character data or an attribute value. XML holds no control character but the tab and
 * the line breaks, and a word processor reports a part that holds another as damaged.
 */
export function escapeXml(value: string): string {
  return value
    .replace(/[^\P{Cc}\t\n\r]|[￾￿]/gu, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// CSS pixels in a length, or null for one that is not an absolute length.
function pixels(length: unknown): number | null {
  const css = lengthToCssPx(length);
  return css === null ? null : Number.parseFloat(css);
}

/** A length in twentieths of a point, as Word writes spacing and indents; null when unreadable. */
export function toTwips(length: unknown): number | null {
  const value = pixels(length);
  return value === null ? null : Math.round(value * 15);
}

/** A length in half points, as Word writes font sizes; null when unreadable. */
export function toHalfPoints(length: unknown): number | null {
  const value = pixels(length);
  return value === null ? null : Math.round(value * 1.5);
}

/** A template's hex color as Word writes it, `1F2937`; null for anything else. */
export function toWordColor(color: unknown): string | null {
  if (typeof color !== 'string') return null;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())?.[1];
  if (!hex) return null;
  const full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex;
  return full.toUpperCase();
}

const GENERIC_FONTS: Readonly<Record<string, string>> = {
  serif: 'Times New Roman',
  'sans-serif': 'Arial',
  monospace: 'Courier New',
  'ui-serif': 'Times New Roman',
  'ui-sans-serif': 'Arial',
  'ui-monospace': 'Courier New',
  'system-ui': 'Arial',
};

/** The font family Word uses for a template font: its first family, a generic one named. */
export function toWordFont(font: unknown): string | null {
  if (typeof font !== 'string') return null;
  const first = font.split(',')[0]?.replace(/["']/g, '').trim() ?? '';
  if (!first) return null;
  return GENERIC_FONTS[first.toLowerCase()] ?? first;
}
