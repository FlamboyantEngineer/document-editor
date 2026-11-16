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

// The advance of a label's characters, in widths of the font's zero, on the generous side, so the
// gutter a label reserves holds it in the common text fonts without measuring it.
function characterWidth(character: string): number {
  if (/[0-9]/.test(character)) return 1;
  if (/[MW]/.test(character)) return 1.8;
  if (/[A-Z]/.test(character)) return 1.4;
  if (/[mw]/.test(character)) return 1.5;
  if (/[a-z]/.test(character)) return 1;
  if (/[\s.,:;'|!]/.test(character)) return 0.6;
  if (/[-()[\]{}/_]/.test(character)) return 0.7;
  return 1.6;
}

/**
 * The room a paragraph's number takes before its text: the label's characters, by their advance in
 * widths of the font's zero (`ch`), and a gap after it.
 */
export function paragraphNumberWidth(label: string): string {
  const width = [...label].reduce((total, character) => total + characterWidth(character), 1);
  // Rounded up to a tenth, past the sum's floating point error.
  return `${String(Math.ceil(width * 10 - 1e-9) / 10)}ch`;
}

/** The level a numbered paragraph is at and the label it shows. */
export interface ParagraphNumberPlace {
  readonly level: number;
  readonly label: string;
}

/**
 * The custom properties that place a numbered paragraph: 20pt of indentation per level below the
 * first, and where its number (`--doc-paragraph-number-indent`) and its text
 * (`--doc-paragraph-text-indent`) start, from the content edge. A level that sets its text position
 * places the text there and the number at its number position, else at the edge. Without one, the
 * number starts after the indentation and the number position, and the text after the room its
 * label takes (`paragraphNumberWidth`).
 */
export function paragraphNumberingIndentationStyle(
  style: ParagraphLevelStyle,
  { level, label }: ParagraphNumberPlace,
): string {
  // A position is written into a style, so one that is not a length is left out.
  const numberIndent = cssLength(style.numberIndent) ?? '0pt';
  const textIndent = cssLength(style.textIndent);
  const indentation =
    level > 1 ? `--doc-paragraph-indentation: ${String((level - 1) * 20)}pt;` : '';
  const numberStart = textIndent
    ? numberIndent
    : `calc(var(--doc-paragraph-indentation, 0pt) + ${numberIndent})`;
  const textStart =
    textIndent ??
    `calc(var(--doc-paragraph-indentation, 0pt) + ${numberIndent} + ${paragraphNumberWidth(label)})`;
  return [
    indentation,
    `--doc-paragraph-number-indent: ${numberStart};`,
    `--doc-paragraph-text-indent: ${textStart};`,
  ]
    .filter(Boolean)
    .join(' ');
}
