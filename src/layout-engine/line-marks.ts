// What draws a text block on its computed lines (DOCE-PAGINATION-11.2): the hooks each line puts on
// a range of the block's content, as plain data with no DOM. The editor's pages draw them as inline
// decorations, and a static render (the viewer, a print paged from a layout result) wraps the same
// ranges in the same hooks, so every output of a layout draws the same lines.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { clusterEnd, clusterStart } from './graphemes.js';
import type { LineTable, TextLine } from './line-table.js';
import type { ReservedBox } from './reserved-boxes.js';

/** A range of a block's content, by offset, and the hooks drawing it on its line. */
export interface LineMark {
  readonly from: number;
  readonly to: number;
  /** The hook class: a line's end, its indented start, or its justified spaces. */
  readonly class: string;
  /** The measured property the hook class reads, as a declaration. */
  readonly style?: string | undefined;
  /**
   * Whether the mark is drawn as an element of its own inside the other marks covering its range,
   * as a reserved box is, so a line's end or indent stays outside the box.
   */
  readonly inner?: boolean | undefined;
  /**
   * For a break drawn among text inserted at `from` (`TextLine.side`), an element of its own with
   * no content: the side it is drawn at among the inserted elements there.
   */
  readonly side?: number | undefined;
}

/** A block's lines as drawn, and whether its alignment justifies them. */
export interface JustifiedLines extends LineTable {
  readonly justify: boolean;
}

const px = (value: number) => `${value.toFixed(3)}px`;

type Range = readonly [number, number];

// Where a line's shown content starts and ends: past the hidden ranges at its start, and before
// those at its end (`LineTable.hidden`), so its marks sit on text the pages draw.
function shownLine(table: JustifiedLines, line: TextLine): TextLine {
  const hidden = table.hidden ?? [];
  if (!hidden.length) return line;
  let { from, to } = line;
  for (let range = startingAt(hidden, from); range && range[1] <= to;) {
    from = range[1];
    range = startingAt(hidden, from);
  }
  for (let range = endingAt(hidden, to); range && range[0] >= from;) {
    to = range[0];
    range = endingAt(hidden, to);
  }
  return { ...line, from, to };
}

const startingAt = (hidden: readonly Range[], at: number) =>
  hidden.find(([from, to]) => from === at && to > at);
const endingAt = (hidden: readonly Range[], at: number) =>
  hidden.find(([from, to]) => to === at && from < at);

// A line's shown text, without the hidden ranges inside it.
function shownText(node: ProseMirrorNode, table: JustifiedLines, line: TextLine): string {
  let text = '';
  let at = line.from;
  const inside = (table.hidden ?? []).filter(([from, to]) => from < line.to && to > line.from);
  for (const [from, to] of inside) {
    if (from > at) text += node.textBetween(at, from, '￼', '￼');
    at = Math.max(at, to);
  }
  if (line.to > at) text += node.textBetween(at, line.to, '￼', '￼');
  return text;
}

// The inline node other than text that holds an offset of a block's content strictly inside it,
// such as math, whose text a view never draws: a mark must take it whole.
function atomAround(node: ProseMirrorNode, offset: number): { from: number; to: number } | null {
  let around: { from: number; to: number } | null = null;
  if (node.childCount === 1 && node.firstChild?.isText) return null;
  node.forEach((child, start) => {
    const to = start + child.nodeSize;
    if (!child.isText && start < offset && offset < to) around = { from: start, to };
  });
  return around;
}

// Where a line's last grapheme cluster starts, so its mark never cuts a cluster: a surrogate
// pair, a joined emoji sequence, a flag or a letter with any number of combining marks; or where
// the inline node it ends with starts, such as math, which draws the mark on its own element.
function lastCharacter(node: ProseMirrorNode, line: TextLine): number {
  const at = clusterStart(node, line.to, line.from);
  return Math.max(line.from, atomAround(node, at)?.from ?? at);
}

// Where a line's first grapheme cluster ends, or the inline node it starts with.
function firstCharacterEnd(node: ProseMirrorNode, line: TextLine): number {
  const at = clusterEnd(node, line.from, line.to);
  return Math.min(line.to, atomAround(node, at)?.to ?? at);
}

// The characters Chromium stretches by `word-spacing`: spaces and no-break spaces, not tabs.
const spacesIn = (text: string) => (text.trimEnd().match(/[ \u00a0]/gu) ?? []).length;

// A soft hyphen, which the browser draws as a hyphen only at a break it chose itself.
const SOFT_HYPHEN = '\u00ad';

// How far a line starts in from where the block's box draws its text: the content edge, past a
// code block's gutter.
const indentOf = (table: LineTable, line: TextLine) =>
  line.left - table.overhead / 2 - (table.inset ?? 0);

/** How a block's lines are drawn besides their table. */
interface LineMarksOptions {
  /**
   * Whether generated content, such as a heading's number, is drawn before the block's content:
   * its first line's indent is then the block's (`firstLineIndent`), before that content.
   */
  readonly prefixed?: boolean | undefined;
}

// The break before a line that starts among inserted text, drawn between the inserted elements
// with the line's indent after it (`de-forced-lines__break`); after a hard break or at the block's
// start, only the indent (`de-forced-lines__indent`).
function insertedStart(
  table: JustifiedLines,
  { line, wraps, prefixed }: { line: TextLine; wraps: boolean; prefixed: boolean },
): LineMark | null {
  const indent = indentOf(table, line);
  const style = indent > 0.001 && !prefixed ? `--de-line-indent: ${px(indent)}` : undefined;
  if (!wraps && !style) return null;
  const at = { from: line.from, to: line.from, side: line.side };
  return { ...at, class: wraps ? 'de-forced-lines__break' : 'de-forced-lines__indent', style };
}

// The marks that draw one line; a line followed by one that starts among inserted text ends at
// that line's break instead.
function marksOfLine(
  node: ProseMirrorNode,
  table: JustifiedLines,
  { line: laid, prefixed, next }: { line: TextLine; prefixed: boolean; next: TextLine | undefined },
): LineMark[] {
  const marks: LineMark[] = [];
  const line = shownLine(table, laid);
  const indent = indentOf(table, line);
  if (indent > 0.001 && line.to > line.from && !prefixed && line.side === undefined) {
    const style = `--de-line-indent: ${px(indent)}`;
    marks.push({
      from: line.from,
      to: firstCharacterEnd(node, line),
      class: 'de-forced-lines__start',
      style,
    });
  }
  if (line.end !== 'wrap' || line.to <= line.from) return marks;
  const text = shownText(node, table, line);
  const spaces = spacesIn(text);
  const room = table.width - table.overhead;
  if (table.justify && spaces > 0 && room > line.width) {
    const style = `--de-word-spacing: ${px((room - line.width) / spaces)}`;
    const end = line.to - (text.length - text.trimEnd().length);
    marks.push({ from: line.from, to: end, class: 'de-forced-lines__justified', style });
  }
  // A line that ends at a line feed, as a code block's lines do, is broken there by the browser.
  if (next?.side !== undefined || text.endsWith('\n')) return marks;
  // A line that ends at a soft hyphen draws its hyphen, as the engine counted it.
  const end = text.endsWith(SOFT_HYPHEN)
    ? 'de-forced-lines__end de-forced-lines__hyphen'
    : 'de-forced-lines__end';
  marks.push({ from: lastCharacter(node, line), to: line.to, class: end });
  return marks;
}

// A cluster drawn in a box of its reserved width (DOCE-PAGINATION-12.4).
const reservedMark = ({ from, to, width }: ReservedBox): LineMark => ({
  from,
  to,
  class: 'de-forced-lines__reserved',
  style: `--de-reserved-width: ${px(width)}`,
  inner: true,
});

// A mark cut at a reserved box's edges, so the box's range is a range of its own that a mark either
// covers whole or not at all: each element drawn on the box then holds it whole.
function cutAt(mark: LineMark, box: ReservedBox): LineMark[] {
  if (mark.to <= box.from || mark.from >= box.to) return [mark];
  if (mark.from >= box.from && mark.to <= box.to) return [mark];
  const edges = [mark.from, Math.max(mark.from, box.from), Math.min(mark.to, box.to), mark.to];
  return edges
    .slice(1)
    .map((to, index) => ({ ...mark, from: edges[index] ?? mark.from, to }))
    .filter(({ from, to }) => to > from);
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
 * The marks that draw a block on its lines, in content order, an inner mark before the others on
 * the same range, and every other mark cut at an inner mark's edges: each wrapped line ends at its
 * last character (`de-forced-lines__end`), with `de-forced-lines__hyphen` too where that is a soft
 * hyphen, a line that starts in from the content edge starts with its indent
 * (`de-forced-lines__start`), except a prefixed block's first line, a wrapped justified line
 * stretches its spaces and no-break spaces (`de-forced-lines__justified`), and a cluster the
 * engine reserved a width for is drawn in a box of that width (`de-forced-lines__reserved`).
 */
export function lineMarks(
  node: ProseMirrorNode,
  table: JustifiedLines,
  { prefixed = false }: LineMarksOptions = {},
): LineMark[] {
  const boxes = table.reserved ?? [];
  // The lines that start in a caption's label start with its part (`labelParts`), not the content.
  const labelled = labelPartTexts(table)?.length ?? 1;
  let marks = table.lines.flatMap((line, index) => {
    const own = marksOfLine(node, table, {
      line,
      prefixed: prefixed && index < labelled,
      next: table.lines[index + 1],
    });
    if (line.side === undefined) return own;
    const wraps = table.lines[index - 1]?.end === 'wrap';
    const start = insertedStart(table, { line, wraps, prefixed: prefixed && index === 0 });
    return start ? [start, ...own] : own;
  });
  for (const box of boxes) marks = marks.flatMap((mark) => cutAt(mark, box));
  return [...marks, ...boxes.map(reservedMark)].sort(
    (a, b) => a.from - b.from || a.to - b.to || Number(!!b.inner) - Number(!!a.inner),
  );
}

/** A part of a caption's label that starts a line (`LineTable.label`), as it is drawn. */
export interface LabelPart {
  readonly text: string;
  /** Its line's indent, for a part after the first, as `--de-line-indent`. */
  readonly style?: string | undefined;
  /** Whether its line ends after it, before the content. */
  readonly breaks: boolean;
}

// The label's text on each line it starts.
function labelPartTexts(table: LineTable): string[] | null {
  if (table.label === undefined) return null;
  const parts = table.label.split('\n');
  return table.label.endsWith('\n') ? parts.slice(0, -1) : parts;
}

/**
 * The parts of a caption's label on the lines they start, where a line breaks inside the label or
 * right after it (DOCE-PAGINATION-11.2): what the pages draw instead of the label alone, each part
 * after the first starting its line at its indent; null when the content starts on the label's
 * line.
 */
export function labelParts(table: LineTable): LabelPart[] | null {
  const texts = labelPartTexts(table);
  if (!texts) return null;
  const ends = table.label?.endsWith('\n') ?? false;
  return texts.map((text, index) => {
    const line = table.lines[index];
    const indent = index > 0 && line ? indentOf(table, line) : 0;
    return {
      text,
      ...(indent > 0.001 ? { style: `--de-line-indent: ${px(indent)}` } : {}),
      breaks: ends || index < texts.length - 1,
    };
  });
}

/**
 * The block a table's lines are drawn over: the block itself, or, for one that shows text it does
 * not hold (`LineTable.text`), as a later part's caption does, a block of its type holding that text.
 */
export function drawnBlock(node: ProseMirrorNode, table: LineTable): ProseMirrorNode {
  if (table.text === undefined) return node;
  return node.type.create(null, table.text ? node.type.schema.text(table.text) : null);
}
