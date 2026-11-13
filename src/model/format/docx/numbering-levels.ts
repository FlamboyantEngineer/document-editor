// The levels of Word's numbering definitions, built from a template's numbering formats: headings
// one level each with the numbers of the levels above, paragraph levels likewise, and lists with
// their bullet or number. Word writes a level's number as `%n` in the level's text.

import {
  resolveParagraphNumberingConfig,
  shouldInsertPrefixSeparator,
} from '../../numbering/document-numbering.js';
import {
  type NumberingStyleConfig,
  resolveCounterStyleToken,
} from '../../numbering/numbering-format.js';
import { resolveParagraphLevelStyle } from '../../numbering/paragraph-numbering.js';
import { resolveHeadingNumbering } from '../../templates/template-numbering.js';
import type { ListSettings, TemplateStyles } from '../template-format.js';
import { escapeXml, toTwips } from './word-xml.js';

/** One numbering level: Word's number format, its text and indentation. */
export interface WordLevel {
  readonly format: string;
  readonly text: string;
  /** Where the text starts and how far the number hangs before it, in twips. */
  readonly indent?: { readonly left: number; readonly hanging: number } | undefined;
}

const WORD_FORMATS: Readonly<Record<string, string>> = {
  decimal: 'decimal',
  'lower-alpha': 'lowerLetter',
  'upper-alpha': 'upperLetter',
  'lower-roman': 'lowerRoman',
  'upper-roman': 'upperRoman',
};

const NONE: WordLevel = { format: 'none', text: '' };

function wordFormat(token: string | undefined): string {
  return WORD_FORMATS[resolveCounterStyleToken(token ?? '1')] ?? 'decimal';
}

/**
 * A level that prints the numbers of its first `depth` levels, as the template's format writes
 * them, with its prefix and suffix; nothing when the format numbers fewer levels.
 */
export function numberedLevel(
  config: NumberingStyleConfig,
  depth: number,
  { prefix = '', suffix = '' }: { prefix?: string; suffix?: string } = {},
): WordLevel {
  if (config.levels.length < depth || depth < 1) return NONE;
  const shown = config.levels.slice(0, depth);
  let text = shown
    .map((level, index) => `%${String(index + 1)}${index < depth - 1 ? level.separator : ''}`)
    .join('');
  if (config.hasTrailingSeparator) text += config.trailingSeparator;
  const lead = shouldInsertPrefixSeparator(prefix, config.trailingSeparator)
    ? prefix + config.trailingSeparator
    : prefix;
  text = lead + text + suffix;
  return { format: wordFormat(shown[depth - 1]?.token), text };
}

/** Each heading level's numbering, levels 1 to 6. */
export function headingLevels(styles: TemplateStyles): WordLevel[] {
  return resolveHeadingNumbering(styles).map((numbering, index) =>
    numberedLevel(numbering.config, index + 1, numbering),
  );
}

/** Each paragraph level's numbering, levels 1 to 6, indented where the level says. */
export function paragraphLevels(styles: TemplateStyles): WordLevel[] {
  const config = resolveParagraphNumberingConfig(styles.paragraph);
  return [1, 2, 3, 4, 5, 6].map((level) => {
    const style = resolveParagraphLevelStyle(config, level);
    const format = style.styleConfig;
    const numbered = format?.levels.length
      ? numberedLevel(format, Math.min(level, format.levels.length), config)
      : NONE;
    const left = toTwips(style.textIndent);
    const start = toTwips(style.numberIndent) ?? 0;
    const indent = left === null ? undefined : { left, hanging: Math.max(0, left - start) };
    return { ...numbered, indent };
  });
}

const BULLETS: Readonly<Record<string, string>> = {
  disc: '•',
  circle: '◦',
  square: '▪',
};

const NESTED_LEVELS = 9;

function listIndent(list: ListSettings | null | undefined, depth: number) {
  const step = toTwips(list?.indentation) ?? 360;
  return { left: step * (depth + 1), hanging: Math.min(step, 360) };
}

/** A bulleted list's nine levels, each with the template's bullet. */
export function bulletLevels(list: ListSettings | null | undefined): WordLevel[] {
  const bullet = list?.bullet ?? 'disc';
  const text = bullet === 'none' ? '' : (BULLETS[bullet] ?? bullet);
  return Array.from({ length: NESTED_LEVELS }, (_, depth) => ({
    format: text ? 'bullet' : 'none',
    text: text,
    indent: listIndent(list, depth),
  }));
}

/** A numbered list's nine levels, each with the template's format, prefix and suffix. */
export function numberLevels(list: ListSettings | null | undefined): WordLevel[] {
  const format = list?.format?.trim() || '1.';
  const token = /[A-Za-z0-9]/.exec(format)?.[0] ?? '1';
  const separator = format.slice(format.indexOf(token) + 1);
  return Array.from({ length: NESTED_LEVELS }, (_, depth) => ({
    format: wordFormat(token),
    text: (list?.prefix ?? '') + `%${String(depth + 1)}` + (separator + (list?.suffix ?? '')),
    indent: listIndent(list, depth),
  }));
}

/** A level as Word writes it in an abstract numbering definition. */
export function writeLevel(level: WordLevel, index: number): string {
  const indent = level.indent
    ? `<w:pPr><w:ind w:left="${String(level.indent.left)}" w:hanging="${String(level.indent.hanging)}"/></w:pPr>`
    : '';
  return [
    `<w:lvl w:ilvl="${String(index)}">`,
    '<w:start w:val="1"/>',
    `<w:numFmt w:val="${level.format}"/>`,
    `<w:lvlText w:val="${escapeXml(level.text)}"/>`,
    '<w:lvlJc w:val="left"/>',
    // A number without a hanging indent is followed by a space, as the editor shows it.
    level.indent ? '' : '<w:suff w:val="space"/>',
    indent,
    '</w:lvl>',
  ].join('');
}
