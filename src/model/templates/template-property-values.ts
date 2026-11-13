// A setting's value as a custom property holds it: the value when it is of the setting's kind, as
// validation knows the kind (DOCE-FORMAT-2.2), else null. The properties are joined into `style`
// attributes and a style element, and a template a host loads may never have been validated, so
// text that is not a value of the kind, which could carry declarations or markup of its own, must
// not reach them.

import {
  isTemplateColor,
  isTemplateLength,
  isTemplateLineHeight,
  isTemplateWeight,
} from '../format/template-format-validate.js';

/** A length with its unit as a CSS value, or null. */
export const cssLength = (value: unknown): string | null =>
  isTemplateLength(value) ? String(value) : null;

/** A hex color as a CSS value, or null. */
export const cssColor = (value: unknown): string | null =>
  isTemplateColor(value) ? String(value) : null;

/** A font weight as a CSS value, or null. */
export const cssWeight = (value: unknown): string | null =>
  isTemplateWeight(value) ? String(value) : null;

/** A line height as a CSS value, or null. */
export const cssLineHeight = (value: unknown): string | null =>
  isTemplateLineHeight(value) ? String(value) : null;

/** One of the keywords a setting takes as a CSS value, or null. */
export const cssKeyword = (value: unknown, keywords: readonly string[]): string | null =>
  keywords.find((keyword) => keyword === value) ?? null;

/** How a text style may align its text. */
export const TEXT_ALIGNMENTS: readonly string[] = ['left', 'center', 'right', 'justify'];
