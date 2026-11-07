// Paragraph numbering: each paragraph level's format and indentation, the counters a numbered
// paragraph advances, and whether a paragraph has the text that earns it a number.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { normalizeParagraphLevel } from '../schema/element-attributes.js';
import { type NumberingStyleConfig, parseNumberingStyle } from './numbering-format.js';

/** A template's settings for one paragraph level. */
export interface ParagraphNumberingLevel {
  numberingStyle?: string;
  indentation?: string | number;
  numberIndent?: string | number;
  textIndent?: string | number;
}

/** A paragraph level's resolved format and indentation. */
export interface ParagraphLevelStyle {
  styleConfig: NumberingStyleConfig | null;
  indentation?: string | number | undefined;
  numberIndent?: string | number | undefined;
  textIndent?: string | number | undefined;
}

/** A length a template may set: a non-negative number of pixels or a length with its unit. */
function normalizeIndentation(value: unknown): string | number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)(?:pt|px|mm|cm|in|em|rem)?$/.test(text)) return undefined;
  return /[a-z]$/.test(text) ? text : `${text}px`;
}

/**
 * A paragraph level's format and indentation. A configured row describes the whole displayed
 * depth under the headings, so below a heading only the paragraph's own levels are kept.
 */
export function resolveParagraphLevelStyle(
  config: Pick<ParagraphLevelStyle, 'styleConfig'> & {
    numberingLevels?: ParagraphNumberingLevel[] | undefined;
  },
  level: number,
  headingDepth = 0,
): ParagraphLevelStyle {
  const entry = config.numberingLevels?.[normalizeParagraphLevel(headingDepth + level) - 1];
  const format = entry?.numberingStyle?.trim()
    ? parseNumberingStyle(entry.numberingStyle)
    : config.styleConfig;
  const styleConfig =
    format && headingDepth > 0 && format.levels.length > level
      ? { ...format, levels: format.levels.slice(-level) }
      : format;
  return {
    styleConfig,
    indentation: normalizeIndentation(entry?.indentation),
    numberIndent: normalizeIndentation(entry?.numberIndent),
    textIndent: normalizeIndentation(entry?.textIndent),
  };
}

/** Advances the counters for a paragraph at a level and returns its number's parts. */
export function advanceParagraphCounters(counters: number[], level: number): number[] {
  const depth = normalizeParagraphLevel(level);
  for (let index = 0; index < depth - 1; index += 1) counters[index] ||= 1;
  counters[depth - 1] = (counters[depth - 1] ?? 0) + 1;
  counters.fill(0, depth);
  return counters.slice(0, depth);
}

/** Whether text earns a number: whitespace and line-break placeholders do not. */
export function hasParagraphNumberingText(text: string): boolean {
  return Boolean(text.replace(/[\u200b\ufeff]/g, '').trim());
}

/** Whether a paragraph earns a number: text that does, or an inline atom other than a break. */
export function hasParagraphNumberingContent(paragraph: ProseMirrorNode): boolean {
  let content = false;
  paragraph.descendants((node) => {
    if (node.isText) content ||= hasParagraphNumberingText(node.text ?? '');
    else if (node.isLeaf && node.type.name !== 'hard_break') content = true;
    return !content;
  });
  return content;
}

/**
 * The custom properties that indent a numbered paragraph. A level without its own indentation is
 * indented 20pt per level below the first; explicit positions are measured from the content edge.
 */
export function paragraphNumberingIndentationStyle(
  style: ParagraphLevelStyle,
  level: number,
): string {
  const size = (value: string | number) =>
    typeof value === 'number' ? `${String(value)}px` : value;
  const indentation = style.indentation ?? (level > 1 ? `${String((level - 1) * 20)}pt` : null);
  return [
    indentation === null ? '' : `--doc-paragraph-indentation: ${size(indentation)};`,
    style.numberIndent === undefined
      ? ''
      : `--doc-paragraph-number-indent: ${size(style.numberIndent)};`,
    style.textIndent === undefined ? '' : `--doc-paragraph-text-indent: ${size(style.textIndent)};`,
  ]
    .filter(Boolean)
    .join(' ');
}
