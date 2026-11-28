// Template lengths in CSS pixels, read in exactly the forms the template format takes and the
// stylesheet is given (`cssLength`, `cssSize`), so the engine falls back for any other form as the
// stylesheet does (DOCE-PAGINATION-9.2).

import { isTemplateLength, isTemplateSize } from '../model/format/template-format-values.js';
import { lengthToCssPx } from '../model/templates/template-css-values.js';

/** The size of the root, which `rem` lengths resolve against. */
const ROOT_SIZE = 16;

// A length's amount and unit, or null for a form the format does not take.
function lengthParts(value: unknown, size: boolean) {
  if (!(size ? isTemplateSize(value) : isTemplateLength(value))) return null;
  const match = /^(\d+(?:\.\d+)?)([a-z%]+)$/.exec(String(value));
  return match ? { amount: Number(match[1]), unit: match[2] ?? '' } : null;
}

function toPixels(parts: { amount: number; unit: string } | null, base: number): number | null {
  if (!parts) return null;
  const { amount, unit } = parts;
  if (unit === '%') return (amount / 100) * base;
  if (unit === 'em' || unit === 'rem') return amount * (unit === 'rem' ? ROOT_SIZE : base);
  return Number.parseFloat(lengthToCssPx(`${String(amount)}${unit}`) ?? '');
}

/** A length in CSS pixels, `em` against a base size and `rem` against the root's; null for none. */
export const resolveLength = (value: unknown, base: number): number | null =>
  toPixels(lengthParts(value, false), base);

/** A font size in CSS pixels, a percentage of the size around it too; null for none. */
export const resolveSize = (value: unknown, base: number): number | null =>
  toPixels(lengthParts(value, true), base);
