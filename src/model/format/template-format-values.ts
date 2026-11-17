// The kinds of value a template's settings hold, each with its test: lengths, colors, numbering
// formats, bullets, line heights, weights and custom style names. They read nothing else, so a
// control that checks what is typed does not carry the whole validator.

import { isCssColor } from '../schema/css-color.js';

const LENGTH = /^-?\d+(?:\.\d+)?(?:px|pt|mm|cm|in|em|rem|%)$/;
// One to six levels, each a counter character and the separators after it.
const NUMBERING_FORMAT = /^(?:[1aAiI][.\-:_/ )]*){0,6}$/;
const BULLET_KEYWORDS: readonly string[] = ['disc', 'circle', 'square', 'none'];
const BULLET_MAX_LENGTH = 8;
/** Control characters, line and paragraph separators, and bidi and zero-width formatting. */
export const NAME_DISALLOWED =
  // eslint-disable-next-line no-control-regex -- matches control characters on purpose
  /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060\ufeff]/;

/** Whether a value is a CSS length with its unit. */
export function isTemplateLength(value: unknown): boolean {
  return typeof value === 'string' && LENGTH.test(value);
}

/**
 * Whether a value is a numbering format: up to six levels, each `1`, `a`, `A`, `i` or `I` and the
 * separators after it (`.`, `-`, `:`, `_`, `/`, `)` and space). Empty numbers nothing.
 */
export function isNumberingFormat(value: unknown): boolean {
  return typeof value === 'string' && NUMBERING_FORMAT.test(value);
}

/** Whether a bullet is a marker keyword (`BulletKeyword`) rather than the text it shows. */
export function isBulletKeyword(value: unknown): boolean {
  return typeof value === 'string' && BULLET_KEYWORDS.includes(value);
}

/** Whether a value is a bullet: a marker keyword, or up to 8 characters of plain text. */
export function isTemplateBullet(value: unknown): boolean {
  if (isBulletKeyword(value)) return true;
  return (
    typeof value === 'string' &&
    value.trim() !== '' &&
    [...value].length <= BULLET_MAX_LENGTH &&
    !NAME_DISALLOWED.test(value)
  );
}

/** What a custom style's name may be: a letter, then letters, digits, `_` or `-`, 16 at most. */
export const CUSTOM_STYLE_NAME = /^[a-z][a-z0-9_-]{0,15}$/i;

/**
 * Whether a value is a template color: a CSS color written plainly, as a hex color, a color's name
 * or a color function of numbers (`isCssColor`).
 */
export function isTemplateColor(value: unknown): boolean {
  return isCssColor(value);
}

/** Whether a value is a line height: a positive multiple of the font size. */
export function isTemplateLineHeight(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** Whether a value is a font weight: a whole number from 1 to 1000. */
export function isTemplateWeight(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 1000;
}
