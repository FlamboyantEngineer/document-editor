// A template variable's value as the pages draw and lay it out, word by word (DOCE-PAGINATION-9.5):
// each word with the white space after it is an element of its own inside the variable, so a line
// can break between two words of the value and the forced lines draw that break between their
// elements, as among a comparison's inserted words (DOCE-PAGINATION-11.11).

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { BodyVariables } from './body-variables.js';
import { type ReserveCluster, reservedBoxes } from './reserved-boxes.js';

/** One word of a variable's value, as it is drawn inside the variable. */
interface VariablePiece {
  /** The word with the white space after it; a line feed that ends it is drawn and breaks its line. */
  readonly text: string;
  /** Its place among the variable's elements, as an editor widget's `side`, going up by 2. */
  readonly side: number;
}

const WORDS = /\s*\S+\s*/gu;

/**
 * A variable's value in its pieces: its words, each with the white space after it up to a line
 * feed, which ends its piece; a value of white space alone is one piece, and each line its line
 * feeds leave empty is a piece of its line feed alone. Line feeds that end the value are left out,
 * as the browser would draw them only before other text.
 */
export function variablePieces(value: string): VariablePiece[] {
  const texts: string[] = [];
  const lines = value.replace(/\n+$/u, '').split('\n');
  lines.forEach((line, index) => {
    const words = line.match(WORDS) ?? (line ? [line] : []);
    const feed = index < lines.length - 1;
    if (!words.length) {
      if (feed) texts.push('\n');
      return;
    }
    // White space before the line's first word belongs to it.
    texts.push(...words.slice(0, -1), `${words.at(-1) ?? ''}${feed ? '\n' : ''}`);
  });
  return texts.map((text, index) => ({ text, side: 2 * index }));
}

/** A word of a variable's value in its line's item: where it starts in the text, and its side. */
export interface ValueWord {
  readonly start: number;
  readonly side: number;
}

/** One line of a variable's value, between its line feeds, laid out as one item. */
interface ValueLine {
  readonly text: string;
  readonly words: readonly ValueWord[];
  /** Whether a line feed ends it, which ends its run. */
  readonly feed: boolean;
}

/**
 * A variable's value in its lines (`variablePieces` joined between line feeds), each laid out as
 * one item, as one element draws it: wrapped, inline code pays its padding once on each line it
 * reaches, as code text does, and its words say where its lines start.
 */
export function valueLines(value: string): ValueLine[] {
  const lines: ValueLine[] = [];
  let words: ValueWord[] = [];
  let text = '';
  for (const piece of variablePieces(value)) {
    const feed = piece.text.endsWith('\n');
    words.push({ start: text.length, side: piece.side });
    text += feed ? piece.text.slice(0, -1) : piece.text;
    if (!feed) continue;
    lines.push({ text, words, feed });
    [words, text] = [[], ''];
  }
  if (words.length) lines.push({ text, words, feed: false });
  return lines;
}

/**
 * The text a variable shows, and whether it is a value: without `variables` or `body`, as where no
 * page variables draw it (a footnote area), the text it holds.
 */
export function variableText(
  child: ProseMirrorNode,
  at: {
    key: string;
    variables?: ReadonlyMap<string, string> | undefined;
    body?: BodyVariables | undefined;
  },
): { text: string; value: boolean } {
  const { key, variables, body } = at;
  if (!variables && !body) return { text: child.textContent, value: false };
  const text = (variables ? variables.get(key) : body?.text(key)) ?? '';
  return { text, value: text !== '' };
}

/** Whether a text holds a cluster of a reserved width, which keeps a value in one box. */
export const holdsReserved = (text: string, font: string, reserve: ReserveCluster | undefined) =>
  reserve !== undefined && reservedBoxes(text, { offset: 0, font, reserve }).length > 0;
