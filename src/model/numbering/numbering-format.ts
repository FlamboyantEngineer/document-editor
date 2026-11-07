// Numbering formats: a template writes a format such as `1.a)` or `I-1`, one character per level,
// and each character names a counter style. Roman numerals have counter styles of their own, since
// a browser's built-in roman styles stop at 3999.

/** How a counter prints. */
export type CounterStyle =
  'decimal' | 'lower-alpha' | 'upper-alpha' | 'lower-roman' | 'upper-roman';

/** One level of a numbering format: its counter character and the text after it. */
export interface NumberingStyleLevel {
  token: string;
  separator: string;
}

/** A parsed numbering format. */
export interface NumberingStyleConfig {
  levels: NumberingStyleLevel[];
  trailingSeparator: string;
  hasTrailingSeparator: boolean;
}

const ROMAN_PAIRS: readonly (readonly [number, string])[] = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

// Bounds the output even for a malformed imported counter holding a huge integer.
const MAX_ROMAN_LENGTH = 100_000;

/** A positive integer in roman numerals. */
export function formatRoman(value: number, letterCase: 'upper' | 'lower' = 'upper'): string {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError('Roman numbering requires a positive safe integer.');
  }
  let remaining = value;
  let output = '';
  for (const [unit, glyph] of ROMAN_PAIRS) {
    const count = Math.floor(remaining / unit);
    if (output.length + count * glyph.length > MAX_ROMAN_LENGTH) {
      throw new RangeError('Roman number is too long.');
    }
    output += glyph.repeat(count);
    remaining %= unit;
  }
  return letterCase === 'lower' ? output.toLowerCase() : output;
}

/** The value of canonical subtractive roman numerals, thousands repeated; null for anything else. */
export function parseRoman(value: unknown): number | null {
  if (typeof value !== 'string' || !value || value.length > MAX_ROMAN_LENGTH) return null;
  if (!/^(?:[IVXLCDM]+|[ivxlcdm]+)$/.test(value)) return null;
  const upper = value.toUpperCase();
  let cursor = 0;
  let total = 0;
  for (const [unit, glyph] of ROMAN_PAIRS) {
    while (upper.startsWith(glyph, cursor)) {
      total += unit;
      cursor += glyph.length;
    }
  }
  return cursor === upper.length && total > 0 && formatRoman(total) === upper ? total : null;
}

/** The counter style a format character names: digits decimal, `i` and `I` roman, other letters alphabetic. */
export function resolveCounterStyleToken(token: string): CounterStyle {
  if (token === 'I') return 'upper-roman';
  if (token === 'i') return 'lower-roman';
  if (/^[a-z]$/.test(token)) return 'lower-alpha';
  if (/^[A-Z]$/.test(token)) return 'upper-alpha';
  return 'decimal';
}

/** The CSS counter style a format character prints with: the library's own for roman numerals. */
export function resolveCssCounterStyleToken(token: string): string {
  const style = resolveCounterStyleToken(token);
  return style.endsWith('-roman') ? `de-${style}` : style;
}

/** A numbering format's levels. Each level is one character, so `11` and `IA` are two levels. */
export function parseNumberingStyle(format: string | null | undefined): NumberingStyleConfig {
  const pattern = format?.trim() ?? '';
  const levels = Array.from(pattern.matchAll(/([A-Za-z0-9])([^A-Za-z0-9]*)/g), (match) => ({
    token: match[1] ?? '1',
    separator: match[2] ?? '',
  }));
  if (!levels.length) levels.push({ token: '1', separator: '' });
  const trailingSeparator = levels[levels.length - 1]?.separator ?? '';
  return { levels, trailingSeparator, hasTrailingSeparator: trailingSeparator.length > 0 };
}

function alphabetic(counter: number): string {
  let remaining = counter;
  let output = '';
  while (remaining > 0) {
    remaining -= 1;
    output = String.fromCharCode(65 + (remaining % 26)) + output;
    remaining = Math.floor(remaining / 26);
  }
  return output;
}

/** A counter's text in a format character's style. A value below 1 or not an integer counts as 1. */
export function formatCounterValue(value: number, token: string): string {
  const counter = Number.isSafeInteger(value) ? Math.max(1, value) : 1;
  const style = resolveCounterStyleToken(token);
  if (style === 'decimal') return String(counter);
  if (style === 'upper-roman' || style === 'lower-roman') {
    return formatRoman(counter, style === 'upper-roman' ? 'upper' : 'lower');
  }
  const letters = alphabetic(counter);
  return style === 'lower-alpha' ? letters.toLowerCase() : letters;
}

/** The roman counter styles, which count without the browser's 3999 limit. */
export const ROMAN_COUNTER_STYLE_CSS = (['upper', 'lower'] as const)
  .map((letterCase) => {
    const symbols = ROMAN_PAIRS.map(
      ([unit, glyph]) =>
        `${String(unit)} "${letterCase === 'lower' ? glyph.toLowerCase() : glyph}"`,
    ).join(', ');
    return `@counter-style de-${letterCase}-roman { system: additive; range: 1 infinite; additive-symbols: ${symbols}; }`;
  })
  .join('\n');

// A heading level in an object's numbering that no heading has opened yet (its counter is 0) is
// left out with its separator, so a document without headings numbers `Table 1`, not `Table 0.1`.
// CSS counters do the same with range-limited counter styles whose fallback prints nothing.
const CONTEXT_EMPTY_STYLE = 'de-context-none';
const CONTEXT_SEPARATOR_NAMES: Readonly<Record<string, string>> = Object.freeze({
  '.': 'dot',
  '-': 'hyphen',
  ':': 'colon',
  _: 'underscore',
  '/': 'slash',
  ' ': 'space',
  ')': 'parenthesis',
});
const CONTEXT_BASE_STYLES = [
  'decimal',
  'lower-alpha',
  'upper-alpha',
  'de-lower-roman',
  'de-upper-roman',
] as const;

/** Whether an object's context level can be left out while its heading counter is 0. */
export function canOmitObjectContextLevel(separator: string): boolean {
  return !separator || Object.hasOwn(CONTEXT_SEPARATOR_NAMES, separator);
}

/** The counter style printing a context counter above 0, and nothing at 0. */
export function resolveObjectContextCounterStyle(cssCounterStyle: string): string {
  return `de-context-${cssCounterStyle.replace(/^de-/, '')}`;
}

/** The counter style printing a separator after a context counter above 0; null when none can. */
export function resolveObjectContextSeparatorCounterStyle(separator: string): string | null {
  const name = CONTEXT_SEPARATOR_NAMES[separator];
  return name ? `de-context-separator-${name}` : null;
}

/** The counter styles that leave out unopened context levels. */
export const OBJECT_CONTEXT_COUNTER_STYLE_CSS = [
  `@counter-style ${CONTEXT_EMPTY_STYLE} { system: cyclic; symbols: ""; }`,
  ...CONTEXT_BASE_STYLES.map(
    (style) =>
      `@counter-style ${resolveObjectContextCounterStyle(style)} { system: extends ${style}; range: 1 infinite; fallback: ${CONTEXT_EMPTY_STYLE}; }`,
  ),
  ...Object.keys(CONTEXT_SEPARATOR_NAMES).map(
    (separator) =>
      `@counter-style ${String(resolveObjectContextSeparatorCounterStyle(separator))} { system: cyclic; symbols: "${separator}"; range: 1 infinite; fallback: ${CONTEXT_EMPTY_STYLE}; }`,
  ),
].join('\n');

/** Every counter style the document's numbering CSS uses. */
export const DOCUMENT_COUNTER_STYLE_CSS = `${ROMAN_COUNTER_STYLE_CSS}\n${OBJECT_CONTEXT_COUNTER_STYLE_CSS}`;
