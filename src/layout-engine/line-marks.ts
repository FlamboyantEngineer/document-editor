// What draws a text block on its computed lines (DOCE-PAGINATION-11.2): the hooks each line puts on
// a range of the block's content, as plain data with no DOM. The editor's pages draw them as inline
// decorations, and a static render (the viewer, a print paged from a layout result) wraps the same
// ranges in the same hooks, so every output of a layout draws the same lines.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { LineTable, TextLine } from './line-table.js';

/** A range of a block's content, by offset, and the hooks drawing it on its line. */
export interface LineMark {
  readonly from: number;
  readonly to: number;
  /** The hook class: a line's end, its indented start, or its justified spaces. */
  readonly class: string;
  /** The measured property the hook class reads, as a declaration. */
  readonly style?: string | undefined;
}

/** A block's lines as drawn, and whether its alignment justifies them. */
export interface JustifiedLines extends LineTable {
  readonly justify: boolean;
}

const px = (value: number) => `${value.toFixed(3)}px`;

// A UTF-16 low surrogate: the second half of a character the line's last character ends with.
const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff;

// Where a line's last character starts, so its mark never cuts a character in two.
function lastCharacter(node: ProseMirrorNode, line: TextLine): number {
  const text = node.textBetween(Math.max(line.from, line.to - 2), line.to, '￼', '￼');
  const two = text.length === 2 && isLowSurrogate(text.charCodeAt(1));
  return two ? line.to - 2 : line.to - 1;
}

// The characters Chromium stretches by `word-spacing`: spaces and no-break spaces, not tabs.
const spacesIn = (text: string) => (text.trimEnd().match(/[ \u00a0]/gu) ?? []).length;

// A soft hyphen, which the browser draws as a hyphen only at a break it chose itself.
const SOFT_HYPHEN = '\u00ad';

// How far a line starts in from the content edge.
const indentOf = (table: JustifiedLines, line: TextLine) => line.left - table.overhead / 2;

/** How a block's lines are drawn besides their table. */
interface LineMarksOptions {
  /**
   * Whether generated content, such as a heading's number, is drawn before the block's content:
   * its first line's indent is then the block's (`firstLineIndent`), before that content.
   */
  readonly prefixed?: boolean | undefined;
}

// The marks that draw one line.
function marksOfLine(
  node: ProseMirrorNode,
  table: JustifiedLines,
  { line, prefixed }: { line: TextLine; prefixed: boolean },
): LineMark[] {
  const marks: LineMark[] = [];
  const indent = indentOf(table, line);
  if (indent > 0.001 && line.to > line.from && !prefixed) {
    const style = `--de-line-indent: ${px(indent)}`;
    marks.push({ from: line.from, to: line.from + 1, class: 'de-forced-lines__start', style });
  }
  if (line.end !== 'wrap' || line.to <= line.from) return marks;
  const text = node.textBetween(line.from, line.to, '￼', '￼');
  const spaces = spacesIn(text);
  const room = table.width - table.overhead;
  if (table.justify && spaces > 0 && room > line.width) {
    const style = `--de-word-spacing: ${px((room - line.width) / spaces)}`;
    const end = line.from + text.trimEnd().length;
    marks.push({ from: line.from, to: end, class: 'de-forced-lines__justified', style });
  }
  // A line that ends at a soft hyphen draws its hyphen, as the engine counted it.
  const end = text.endsWith(SOFT_HYPHEN)
    ? 'de-forced-lines__end de-forced-lines__hyphen'
    : 'de-forced-lines__end';
  marks.push({ from: lastCharacter(node, line), to: line.to, class: end });
  return marks;
}

/**
 * The indent of a block's first line as the block's measured property (`--de-first-indent`), for
 * a block drawn with generated content before its content (`prefixed`), which the indent must
 * come before; null when the line starts at the content edge.
 */
export function firstLineIndent(table: JustifiedLines): string | null {
  const first = table.lines[0];
  const indent = first ? indentOf(table, first) : 0;
  return indent > 0.001 ? `--de-first-indent: ${px(indent)}` : null;
}

/**
 * The marks that draw a block on its lines, in content order: each wrapped line ends at its last
 * character (`de-forced-lines__end`), with `de-forced-lines__hyphen` too where that is a soft
 * hyphen, a line that starts in from the content edge starts with its indent
 * (`de-forced-lines__start`), except a prefixed block's first line, and a wrapped justified line
 * stretches its spaces and no-break spaces (`de-forced-lines__justified`).
 */
export function lineMarks(
  node: ProseMirrorNode,
  table: JustifiedLines,
  { prefixed = false }: LineMarksOptions = {},
): LineMark[] {
  return table.lines
    .flatMap((line, index) => marksOfLine(node, table, { line, prefixed: prefixed && index === 0 }))
    .sort((a, b) => a.from - b.from || a.to - b.to);
}
