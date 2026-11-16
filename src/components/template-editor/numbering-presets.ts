// The numbering formats a format field offers, each shown with the numbers it gives, such as `I.`
// as `I., II., III.`, by the formatter the document numbers with.

import { formatCounterValue, parseNumberingStyle } from '../../model/index.js';

/** The formats a numbering format field offers; any other may be typed. */
export const NUMBERING_PRESETS: readonly string[] = [
  '1.',
  '1)',
  'a.',
  'a)',
  'A.',
  'i.',
  'I.',
  '1.1.',
  'A.1.',
  'I.1.i',
];

/** The first three numbers a format gives at its last level, such as `I.1.i, I.1.ii, I.1.iii`. */
export function numberingExample(format: string): string {
  const { levels } = parseNumberingStyle(format);
  const at = (last: number) =>
    levels
      .map(({ token, separator }, index) => {
        const value = index === levels.length - 1 ? last : 1;
        return formatCounterValue(value, token) + separator;
      })
      .join('');
  return [1, 2, 3].map(at).join(', ');
}

/** The offered formats as a field's options, each described by its numbers. */
export const NUMBERING_OPTIONS = NUMBERING_PRESETS.map((format) => ({
  id: format,
  label: format,
  description: numberingExample(format),
}));
