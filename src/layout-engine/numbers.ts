// The numbers the stylesheet shows before headings and numbered paragraphs, by position, counted
// as the editor's paragraph numbering counts them, and where a numbered paragraph's number and text
// start: the engine lays both out in place of the stylesheet's generated content.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { numberedHeadings, numberedParagraphs } from '../engine/paragraph-numbering.js';
import type { TemplateFile } from '../model/format/template-format.js';
import {
  type ParagraphLevelStyle,
  paragraphNumberWidth,
} from '../model/numbering/paragraph-numbering.js';
import { resolveLength } from './template-lengths.js';

/** A numbered paragraph's number and its level's positions. */
export interface ParagraphNumber {
  /** The number without the space after it. */
  readonly label: string;
  readonly level: number;
  readonly levelStyle: ParagraphLevelStyle;
  /** A later part of a split paragraph: every line at the text position, with no number. */
  readonly continued?: boolean | undefined;
}

/** A document's heading numbers and paragraph numbers, by the position of their block. */
interface DocumentNumbers {
  /** Each numbered heading's number with the space after it. */
  readonly headings: ReadonlyMap<number, string>;
  readonly paragraphs: ReadonlyMap<number, ParagraphNumber>;
}

/** Where a numbered paragraph's first and other lines start, and the room its number takes. */
interface NumberPlacement {
  readonly firstStart: number;
  readonly restStart: number;
  /** The width of the number's box at the first line's start. */
  readonly box: number;
}

/** What a paragraph number is placed from. */
interface NumberPlacementInput {
  readonly number: ParagraphNumber;
  /** The block's font size, which relative positions resolve against. */
  readonly size: number;
  /** The paragraph style's indentation, which a level's positions start after. */
  readonly indentation: number;
  /** The width of a text in the block's font. */
  readonly measure: (text: string) => number;
}

/** How far each paragraph level below the first indents, in points. */
const LEVEL_INDENT_PT = 20;
const PX_PER_PT = 96 / 72;

/** The numbers of a document's headings and paragraphs, as the stylesheet shows them. */
export function documentNumbers(doc: ProseMirrorNode, template: TemplateFile): DocumentNumbers {
  const headings = new Map(numberedHeadings(doc, template).map(({ pos, text }) => [pos, text]));
  const paragraphs = new Map(
    numberedParagraphs(doc, template).map(({ pos, level, text, levelStyle, continued }) => [
      pos,
      { label: text, level, levelStyle, continued },
    ]),
  );
  return { headings, paragraphs };
}

/**
 * A numbered paragraph's line starts, as the stylesheet places them: its text at the level's text
 * position, else after the indentation, the number position and the room the label reserves (in
 * widths of the font's zero); its number at the number position, in a box at least as wide as the
 * gap to the text. A later part of a split paragraph starts every line at the text position.
 */
export function placeNumber({ number, size, indentation, measure }: NumberPlacementInput) {
  const { level, label, levelStyle } = number;
  const indent = level > 1 ? (level - 1) * LEVEL_INDENT_PT * PX_PER_PT : indentation;
  const numberIndent = resolveLength(levelStyle.numberIndent, size) ?? 0;
  const textIndent = resolveLength(levelStyle.textIndent, size);
  const firstStart = textIndent === null ? indent + numberIndent : numberIndent;
  const reserved = Number.parseFloat(paragraphNumberWidth(label)) * measure('0');
  const restStart = textIndent ?? indent + numberIndent + reserved;
  // A later part continues its first part's lines, which all start at the text position.
  if (number.continued)
    return { firstStart: restStart, restStart, box: 0 } satisfies NumberPlacement;
  const box = Math.max(restStart - firstStart, measure(`${label} `));
  return { firstStart, restStart, box } satisfies NumberPlacement;
}
