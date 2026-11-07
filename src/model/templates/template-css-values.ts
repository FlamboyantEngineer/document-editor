// The CSS values a template's settings become: page sizes, lengths in pixels and safe font stacks.
// The editor and a host's export both read them, so a printed page matches the screen.

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

const PX_PER_UNIT: Readonly<Record<string, number>> = Object.freeze({
  px: 1,
  pt: 96 / 72,
  in: 96,
  mm: MM_TO_CSS_PX,
  cm: MM_TO_CSS_PX * 10,
});

/**
 * An absolute length in non-negative CSS pixels, such as a margin; null for a relative length,
 * such as `2em`, or anything that is not a length.
 */
export function lengthToCssPx(length: unknown): string | null {
  if (typeof length !== 'string') return null;
  const match = /^(-?\d+(?:\.\d+)?)(px|pt|in|mm|cm)$/.exec(length.trim());
  const unit = match?.[2];
  if (!match || !unit) return null;
  return `${String(Math.max(0, Number(match[1]) * (PX_PER_UNIT[unit] ?? 1)))}px`;
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
 * A template font as a safe CSS font stack, or the fallback when it names none. A family the host
 * serves itself is written as the stack it names in `fontStacks`, such as the family with its
 * fallbacks.
 */
export function resolveFontStack(
  font: string | null | undefined,
  fallback = '',
  fontStacks: Readonly<Record<string, string>> = {},
): string {
  const raw = font?.trim() || fallback;
  const hosted = Object.hasOwn(fontStacks, raw) ? fontStacks[raw] : undefined;
  if (hosted) return hosted;
  return raw.split(',').map(sanitizeFontFamily).filter(Boolean).join(', ') || fallback;
}
