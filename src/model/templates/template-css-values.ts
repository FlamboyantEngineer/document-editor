// The CSS values a template's stored settings become: page sizes and margins, sizes and texts, and
// font stacks. The editor and a host's export both read them, so a printed page matches the screen.

import { storedText } from '../stored-text.js';

/** CSS pixels per millimetre. */
export const MM_TO_CSS_PX = 96 / 25.4;

/** The width and height of each page size a template may name. */
export const PAGE_SIZE_DIMENSIONS: Readonly<Record<string, { width: string; height: string }>> =
  Object.freeze({
    A0: { width: '841mm', height: '1189mm' },
    A1: { width: '594mm', height: '841mm' },
    A2: { width: '420mm', height: '594mm' },
    A3: { width: '297mm', height: '420mm' },
    A4: { width: '210mm', height: '297mm' },
    A5: { width: '148mm', height: '210mm' },
    A6: { width: '105mm', height: '148mm' },
    A7: { width: '74mm', height: '105mm' },
    A8: { width: '52mm', height: '74mm' },
    A9: { width: '37mm', height: '52mm' },
    A10: { width: '26mm', height: '37mm' },
    'US Letter': { width: '8.5in', height: '11in' },
    'US Legal': { width: '8.5in', height: '14in' },
    'US Tabloid': { width: '11in', height: '17in' },
    'US Ledger': { width: '17in', height: '11in' },
    'US Executive': { width: '7.25in', height: '10.5in' },
    'US Statement': { width: '5.5in', height: '8.5in' },
    'US Junior Legal': { width: '5in', height: '8in' },
    'US Half-Letter': { width: '5.5in', height: '8.5in' },
    'US Government Letter': { width: '8in', height: '10.5in' },
    'US Government Legal': { width: '8.5in', height: '13in' },
  });

/** The unit a bare margin number is in: millimetres for an ISO page size, inches otherwise. */
export function resolveTemplateMarginUnit(pageSize: unknown): string {
  return /^A\d+$/.test((storedText(pageSize) ?? '').trim().toUpperCase()) ? 'mm' : 'in';
}

/** A non-negative number of millimetres or inches in CSS pixels. */
export function formatNumericMarginToCssPx(value: number, numericUnit = 'mm'): string {
  const multiplier = numericUnit.trim().toLowerCase() === 'in' ? 96 : MM_TO_CSS_PX;
  return `${String(Math.max(0, value) * multiplier)}px`;
}

/** A margin in CSS pixels, from a bare number in the given unit or a length in mm, in, pt or px. */
export function parseMarginToCssPx(value: unknown, numericUnit = 'mm'): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return formatNumericMarginToCssPx(value, numericUnit);
  }
  const raw = (storedText(value) ?? '').trim();
  const parsed = Number.parseFloat(raw);
  if (!raw || !Number.isFinite(parsed)) return null;
  if (raw.endsWith('mm')) return formatNumericMarginToCssPx(parsed, 'mm');
  if (raw.endsWith('in')) return formatNumericMarginToCssPx(parsed, 'in');
  if (raw.endsWith('pt')) return `${String(Math.max(0, parsed) * (96 / 72))}px`;
  return `${String(Math.max(0, parsed))}px`;
}

/** A CSS size: a value with its unit as written, a bare number in pixels, or the fallback. */
export function toTemplateCssSizeValue(value: unknown, fallback = '0px'): string {
  const raw = (storedText(value) ?? '').trim();
  if (!raw) return fallback;
  return /[a-z%]+$/i.test(raw) ? raw : `${raw}px`;
}

/** A trimmed CSS text value, or the fallback when it is empty. */
export function toTemplateCssTextValue(value: unknown, fallback = ''): string {
  const raw = storedText(value);
  if (raw === null) return fallback;
  return raw.trim() || fallback;
}

/** Text to show as written, or the fallback when it is blank. */
export function toTemplateDisplayText(value: unknown, fallback = ''): string {
  const raw = storedText(value);
  return raw?.trim() ? raw : fallback;
}

/**
 * A text style's line height: `lineHeight`, else `lineSpacing`. An unset line height is saved as
 * an empty string; like an absent value it falls back to `lineSpacing`, rather than setting every
 * line to height 0.
 */
export function resolveTemplateStyleLineHeight(
  style: { lineHeight?: unknown; lineSpacing?: unknown } | null | undefined,
): unknown {
  for (const value of [style?.lineHeight, style?.lineSpacing]) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && !value.trim()) continue;
    return value;
  }
  return undefined;
}

const GENERIC_FONT_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'inherit',
  'initial',
  'unset',
  'revert',
  'math',
  'emoji',
  'fangsong',
]);

// One font name of an authored stack, made safe to write in a `font-family` declaration inside a
// style element: quotes, breakout characters and control characters go; a generic family or a bare
// identifier stays unquoted, and any other name is quoted.
function sanitizeFontFamily(token: string): string {
  const stripped = token
    .replace(/["']/g, '')
    .replace(/[{}<>;]/g, '')
    // eslint-disable-next-line no-control-regex -- removes control characters on purpose
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
  if (!stripped) return '';
  const lower = stripped.toLowerCase();
  if (GENERIC_FONT_FAMILIES.has(lower)) return lower;
  if (/^[A-Za-z][A-Za-z0-9-]*$/.test(stripped)) return stripped;
  return `"${stripped}"`;
}

/**
 * A template font as a safe CSS font stack. A family the host serves itself is written as the
 * stack it names in `fontStacks`, such as the family with its fallbacks.
 */
export function resolveTemplateFontFamilyCssText(
  value: unknown,
  fallback = '',
  fontStacks: Readonly<Record<string, string>> = {},
): string {
  const raw = toTemplateCssTextValue(value, fallback);
  const hosted = Object.hasOwn(fontStacks, raw) ? fontStacks[raw] : undefined;
  if (hosted) return hosted;
  const sanitized = raw.split(',').map(sanitizeFontFamily).filter(Boolean).join(', ');
  return sanitized || toTemplateCssTextValue(fallback, '');
}
