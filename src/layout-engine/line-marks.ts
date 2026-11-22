// What draws a text block on its computed lines (DOCE-PAGINATION-11.2): the hooks each line puts on
// a range of the block's content, as plain data with no DOM. The editor's pages draw them as inline
// decorations, and a static render (the viewer, a print paged from a layout result) wraps the same
// ranges in the same hooks, so every output of a layout draws the same lines.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
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
}

/** A block's lines as drawn, and whether its alignment justifies them. */
export interface JustifiedLines extends LineTable {
  readonly justify: boolean;
}

const px = (value: number) => `${value.toFixed(3)}px`;

// How far a line's first or last grapheme cluster is looked for, in UTF-16 units: a family emoji
// of four people with skin tones is 19, a flag of a subdivision 14.
const CLUSTER_WINDOW = 32;
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

// The UTF-16 length of the first or last grapheme cluster of a text.
function clusterLength(text: string, last: boolean): number {
  const clusters = [...graphemes.segment(text)];
  return (last ? clusters.at(-1) : clusters[0])?.segment.length ?? 1;
}

// Where a line's last grapheme cluster starts, so its mark never cuts a cluster: a surrogate
// pair, a joined emoji sequence, a flag or a letter with its combining marks.
function lastCharacter(node: ProseMirrorNode, line: TextLine): number {
  const from = Math.max(line.from, line.to - CLUSTER_WINDOW);
  return line.to - clusterLength(node.textBetween(from, line.to, '￼', '￼'), true);
}

// Where a line's first grapheme cluster ends.
function firstCharacterEnd(node: ProseMirrorNode, line: TextLine): number {
  const to = Math.min(line.to, line.from + CLUSTER_WINDOW);
  return line.from + clusterLength(node.textBetween(line.from, to, '￼', '￼'), false);
}

const spacesIn = (text: string) => (text.trimEnd().match(/ /gu) ?? []).length;

// The marks that draw one line.
function marksOfLine(node: ProseMirrorNode, table: JustifiedLines, line: TextLine): LineMark[] {
  const marks: LineMark[] = [];
  const indent = line.left - table.overhead / 2;
  if (indent > 0.001 && line.to > line.from) {
    const style = `--de-line-indent: ${px(indent)}`;
    marks.push({
      from: line.from,
      to: firstCharacterEnd(node, line),
      class: 'de-forced-lines__start',
      style,
    });
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
  marks.push({ from: lastCharacter(node, line), to: line.to, class: 'de-forced-lines__end' });
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
 * The marks that draw a block on its lines, in content order, an inner mark before the others on
 * the same range, and every other mark cut at an inner mark's edges: each wrapped line ends at its last character (`de-forced-lines__end`), a line
 * that starts in from the content edge starts with its indent (`de-forced-lines__start`), a
 * wrapped justified line stretches its spaces (`de-forced-lines__justified`), and a cluster the
 * engine reserved a width for is drawn in a box of that width (`de-forced-lines__reserved`).
 */
export function lineMarks(node: ProseMirrorNode, table: JustifiedLines): LineMark[] {
  const boxes = table.reserved ?? [];
  let marks = table.lines.flatMap((line) => marksOfLine(node, table, line));
  for (const box of boxes) marks = marks.flatMap((mark) => cutAt(mark, box));
  return [...marks, ...boxes.map(reservedMark)].sort(
    (a, b) => a.from - b.from || a.to - b.to || Number(!!b.inner) - Number(!!a.inner),
  );
}
