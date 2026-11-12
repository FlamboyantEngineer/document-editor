// The CSS `content` that numbers headings, paragraphs and captioned objects from a template's
// numbering formats. The values are quoted CSS strings inside a style element, so every authored
// text is escaped for both.

import type { ParagraphLevelSettings, ParagraphSettings } from '../format/template-format.js';
import {
  canOmitObjectContextLevel,
  type NumberingStyleConfig,
  parseNumberingStyle,
  resolveCssCounterStyleToken,
  resolveObjectContextCounterStyle,
  resolveObjectContextSeparatorCounterStyle,
} from './numbering-format.js';

/** The text a template sets before and after a number. */
export interface NumberingAffixes {
  prefix?: string | undefined;
  suffix?: string | undefined;
}

/** A paragraph style's numbering. */
export interface ParagraphNumberingConfig {
  levels?: ParagraphLevelSettings[] | undefined;
  styleConfig: NumberingStyleConfig | null;
  prefix: string;
  suffix: string;
}

/** A counter's CSS content, and whether it prints anything. */
export interface CounterContent {
  enabled: boolean;
  content: string;
}

/** What an object's number is built from beside its own format. */
export interface ObjectCounterOptions extends NumberingAffixes {
  /** Each heading level's resolved format, whose characters number the object's context levels. */
  headingNumbering?: readonly (NumberingStyleConfig | undefined)[] | null | undefined;
  /** Whether the number labels a caption, which adds ` - ` itself. */
  captionLabel?: boolean | undefined;
}

/** A format that numbers nothing. */
export function buildDisabledNumberingStyle(): NumberingStyleConfig {
  return { levels: [], trailingSeparator: '', hasTrailingSeparator: false };
}

/**
 * Authored text as the inside of a double-quoted CSS string in a style element: backslashes,
 * quotes and line breaks escaped, and `<` and `>` too, so it can never close the style element.
 */
export function escapeCssContent(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\A ')
    .replace(/\r/g, '\\D ')
    .replace(/\f/g, '\\C ')
    .replace(/</g, '\\3C ')
    .replace(/>/g, '\\3E ');
}

const quoted = (value: string) => `"${escapeCssContent(value)}"`;

/** Whether a prefix needs the format's trailing separator before the number. */
export function shouldInsertPrefixSeparator(prefix: string, trailingSeparator: string): boolean {
  if (!prefix || !trailingSeparator) return false;
  return !/\s$/.test(prefix);
}

/** A paragraph style's numbering; an empty or absent format numbers nothing. */
export function resolveParagraphNumberingConfig(
  settings: ParagraphSettings | null | undefined,
): ParagraphNumberingConfig {
  const numbering = settings?.numbering;
  const format = numbering?.enabled === false ? '' : numbering?.format?.trim();
  return {
    styleConfig: format ? parseNumberingStyle(format) : buildDisabledNumberingStyle(),
    levels: numbering?.levels?.map((level) => level ?? {}),
    prefix: numbering?.prefix ?? '',
    suffix: numbering?.suffix ?? '',
  };
}

function prefixSegments(styleConfig: NumberingStyleConfig, prefix: string): string[] {
  if (!prefix) return [];
  const segments = [quoted(prefix)];
  if (shouldInsertPrefixSeparator(prefix, styleConfig.trailingSeparator)) {
    segments.push(quoted(styleConfig.trailingSeparator));
  }
  return segments;
}

/** A paragraph's number: its format's last level, with the style's prefix and suffix. */
export function buildParagraphCounterContent(
  styleConfig: NumberingStyleConfig | null,
  { prefix = '', suffix = '' }: NumberingAffixes = {},
): CounterContent {
  const token = styleConfig?.levels[styleConfig.levels.length - 1]?.token ?? '';
  if (!styleConfig || !token) return { enabled: false, content: '""' };
  const segments = prefixSegments(styleConfig, prefix);
  segments.push(`counter(paragraph, ${resolveCssCounterStyleToken(token)})`);
  if (styleConfig.hasTrailingSeparator) segments.push(quoted(styleConfig.trailingSeparator));
  if (suffix) segments.push(quoted(suffix));
  segments.push('" "');
  return { enabled: true, content: segments.join(' ') };
}

/** A heading's number: one counter per level down to its own, when its format has that many. */
export function buildHeadingCounterContent(
  styleConfig: NumberingStyleConfig,
  headingLevel: number,
  { prefix = '', suffix = '' }: NumberingAffixes = {},
): CounterContent {
  if (styleConfig.levels.length < headingLevel) return { enabled: false, content: '""' };
  const limit = Math.max(1, Math.min(headingLevel, 6, styleConfig.levels.length));
  const segments: string[] = [];
  styleConfig.levels.slice(0, limit).forEach((level, index) => {
    segments.push(`counter(h${String(index + 1)}, ${resolveCssCounterStyleToken(level.token)})`);
    if (index < limit - 1 && level.separator) segments.push(quoted(level.separator));
  });
  if (styleConfig.hasTrailingSeparator) segments.push(quoted(styleConfig.trailingSeparator));
  if (suffix) segments.push(quoted(suffix));
  segments.push('" "');
  return {
    enabled: true,
    content: [...prefixSegments(styleConfig, prefix), ...segments].join(' '),
  };
}

// A context level no heading has opened yet prints nothing, separator included.
function contextCounterSegments(headingLevel: number, cssStyle: string, separator: string) {
  const counter = `h${String(headingLevel)}`;
  if (!canOmitObjectContextLevel(separator)) {
    return [`counter(${counter}, ${cssStyle})`, quoted(separator)];
  }
  const segments = [`counter(${counter}, ${resolveObjectContextCounterStyle(cssStyle)})`];
  const separatorStyle = separator ? resolveObjectContextSeparatorCounterStyle(separator) : null;
  if (separatorStyle) segments.push(`counter(${counter}, ${separatorStyle})`);
  return segments;
}

/** The format character a context level prints with: its heading level's, or the object's own. */
export function resolveObjectContextHeadingToken(
  headingNumbering: ObjectCounterOptions['headingNumbering'],
  contextLevelIndex: number,
  fallbackToken: string,
): string {
  return headingNumbering?.[contextLevelIndex]?.levels[contextLevelIndex]?.token || fallbackToken;
}

/**
 * An object's number: its format's leading levels count the headings it sits under, and its last
 * level counts the object. A caption label drops the trailing separator and space, since the
 * caption adds ` - ` itself: `Table 1.1 - caption`.
 */
export function buildObjectCounterContent(
  styleConfig: NumberingStyleConfig,
  counterName: string,
  options: ObjectCounterOptions = {},
): string {
  const { prefix = '', suffix = '', headingNumbering = null, captionLabel = false } = options;
  const segments = prefixSegments(styleConfig, prefix);
  const contextDepth = Math.max(0, styleConfig.levels.length - 1);
  styleConfig.levels.slice(0, contextDepth).forEach((level, index) => {
    const token = resolveObjectContextHeadingToken(headingNumbering, index, level.token);
    const cssStyle = resolveCssCounterStyleToken(token);
    segments.push(...contextCounterSegments(index + 1, cssStyle, level.separator));
  });
  const lastToken = styleConfig.levels[styleConfig.levels.length - 1]?.token ?? '1';
  segments.push(`counter(${counterName}, ${resolveCssCounterStyleToken(lastToken)})`);
  if (styleConfig.hasTrailingSeparator && !captionLabel) {
    segments.push(quoted(styleConfig.trailingSeparator));
  }
  if (suffix) segments.push(quoted(suffix));
  if (!captionLabel) segments.push('" "');
  return segments.join(' ');
}
