// Paragraph numbering: each paragraph level's format and indentation, the counters a numbered
// paragraph advances, and whether a paragraph has the text that earns it a number.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Length } from '../format/template-format.js';
import { normalizeParagraphLevel } from '../schema/element-attributes.js';
import { cssLength } from '../templates/template-property-values.js';
import type { ParagraphNumberingConfig } from './document-numbering.js';
import { type NumberingStyleConfig, parseNumberingStyle } from './numbering-format.js';

/** A paragraph level's resolved format and where its number and text start. */
export interface ParagraphLevelStyle {
  styleConfig: NumberingStyleConfig | null;
  numberIndent?: Length | undefined;
  textIndent?: Length | undefined;
}

/**
 * A paragraph level's format and indentation. A configured row describes the whole displayed
 * depth under the headings, so below a heading only the paragraph's own levels are kept.
 */
export function resolveParagraphLevelStyle(
  config: Pick<ParagraphNumberingConfig, 'styleConfig' | 'levels'>,
  level: number,
  headingDepth = 0,
): ParagraphLevelStyle {
  const entry = config.levels?.[normalizeParagraphLevel(headingDepth + level) - 1];
  const format = entry?.format?.trim() ? parseNumberingStyle(entry.format) : config.styleConfig;
  const styleConfig =
    format && headingDepth > 0 && format.levels.length > level
      ? { ...format, levels: format.levels.slice(-level) }
      : format;
  return {
    styleConfig,
    numberIndent: entry?.numberIndent ?? undefined,
    textIndent: entry?.textIndent ?? undefined,
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
 * The custom properties that indent a numbered paragraph: 20pt per level below the first, and the
 * level's number and text positions, measured from the content edge, when it sets them.
 */
export function paragraphNumberingIndentationStyle(
  style: ParagraphLevelStyle,
  level: number,
): string {
  // A position is written into a style, so one that is not a length is left out.
  const numberIndent = cssLength(style.numberIndent);
  const textIndent = cssLength(style.textIndent);
  return [
    level > 1 ? `--doc-paragraph-indentation: ${String((level - 1) * 20)}pt;` : '',
    numberIndent ? `--doc-paragraph-number-indent: ${numberIndent};` : '',
    textIndent ? `--doc-paragraph-text-indent: ${textIndent};` : '',
  ]
    .filter(Boolean)
    .join(' ');
}
