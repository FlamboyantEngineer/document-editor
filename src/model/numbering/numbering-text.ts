// The text a heading's or an object's number shows, as the CSS counter content from the same
// format prints it (document-numbering.ts), for lists of contents, references and exports.

import {
  type NumberingAffixes,
  type ObjectCounterOptions,
  resolveObjectContextHeadingToken,
  shouldInsertPrefixSeparator,
} from './document-numbering.js';
import {
  canOmitObjectContextLevel,
  formatCounterValue,
  type NumberingStyleConfig,
} from './numbering-format.js';

/** An object's own count and the heading counters at it. */
export interface ObjectCounters {
  readonly count: number;
  readonly headingCounters: readonly number[];
}

// A counter's text; one no element has advanced yet prints 0, as a CSS counter does.
const counterText = (value: number, token: string) =>
  value >= 1 ? formatCounterValue(value, token) : String(Math.max(0, Math.trunc(value) || 0));

function withPrefix(styleConfig: NumberingStyleConfig, prefix: string, text: string): string {
  if (!prefix) return text;
  const separator = shouldInsertPrefixSeparator(prefix, styleConfig.trailingSeparator)
    ? styleConfig.trailingSeparator
    : '';
  return prefix + separator + text;
}

/**
 * A heading's number, without the space after it, from the heading counters down to its own level
 * (so a level 2 heading passes two). Empty when its format does not number its level.
 */
export function headingNumberText(
  styleConfig: NumberingStyleConfig,
  counters: readonly number[],
  { prefix = '', suffix = '' }: NumberingAffixes = {},
): string {
  const headingLevel = Math.max(1, counters.length);
  if (styleConfig.levels.length < headingLevel) return '';
  const limit = Math.max(1, Math.min(headingLevel, 6, styleConfig.levels.length));
  let text = '';
  styleConfig.levels.slice(0, limit).forEach((level, index) => {
    text += counterText(counters[index] ?? 0, level.token);
    if (index < limit - 1) text += level.separator;
  });
  if (styleConfig.hasTrailingSeparator) text += styleConfig.trailingSeparator;
  return withPrefix(styleConfig, prefix, text + suffix);
}

/**
 * An object's number, without the space after it: its context levels from the heading counters at
 * it, leaving out a level no heading has opened when its separator allows, then its own count. A
 * caption label leaves out the trailing separator, as its counter content does.
 */
export function objectNumberText(
  styleConfig: NumberingStyleConfig,
  { count, headingCounters }: ObjectCounters,
  options: ObjectCounterOptions = {},
): string {
  const { prefix = '', suffix = '', headingNumbering = null, captionLabel = false } = options;
  const contextDepth = Math.max(0, styleConfig.levels.length - 1);
  let text = '';
  styleConfig.levels.slice(0, contextDepth).forEach((level, index) => {
    const value = headingCounters[index] ?? 0;
    if (value <= 0 && canOmitObjectContextLevel(level.separator)) return;
    text += counterText(
      value,
      resolveObjectContextHeadingToken(headingNumbering, index, level.token),
    );
    text += level.separator;
  });
  text += counterText(count, styleConfig.levels[styleConfig.levels.length - 1]?.token ?? '1');
  if (styleConfig.hasTrailingSeparator && !captionLabel) text += styleConfig.trailingSeparator;
  return withPrefix(styleConfig, prefix, text + suffix);
}
