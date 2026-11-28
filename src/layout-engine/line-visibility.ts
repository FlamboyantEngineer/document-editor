// The parts of a forced line its markup shows (DOCE-PAGINATION-11.12).

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { countPrefix } from '../utils/count-prefix.js';
import { inlineText } from './inline-content.js';
import type { LineTable, TextLine } from './line-table.js';

type HiddenRanges = NonNullable<LineTable['hidden']>;

// Hidden ranges do not overlap and are sorted, so their end offsets are sorted too.
const firstEndingAfter = (hidden: HiddenRanges, at: number) =>
  countPrefix(hidden.length, (index) => (hidden[index]?.[1] ?? Infinity) <= at);

/** The line past hidden ranges at its start and before those at its end. */
export function shownLine(hidden: LineTable['hidden'], line: TextLine): TextLine {
  if (!hidden?.length) return line;
  let { from, to } = line;
  for (let index = firstEndingAfter(hidden, from); index < hidden.length; index += 1) {
    const range = hidden[index];
    if (!range || range[0] !== from || range[1] > to) break;
    from = range[1];
  }
  for (let index = firstEndingAfter(hidden, to) - 1; index >= 0; index -= 1) {
    const range = hidden[index];
    if (!range || range[1] !== to || range[0] < from) break;
    to = range[0];
  }
  return { ...line, from, to };
}

/** The nonempty ranges of a content span that its markup shows, in content order. */
export function* shownRanges(
  hidden: LineTable['hidden'],
  from: number,
  to: number,
): Iterable<readonly [number, number]> {
  let at = from;
  if (hidden?.length) {
    for (let index = firstEndingAfter(hidden, at); index < hidden.length; index += 1) {
      const range = hidden[index];
      if (!range || range[0] >= to) break;
      if (range[0] > at) yield [at, range[0]];
      at = range[1];
    }
  }
  if (to > at) yield [at, to];
}

/** The line's text without its hidden ranges, with one object character per inline node. */
export function shownText(
  node: ProseMirrorNode,
  hidden: LineTable['hidden'],
  line: TextLine,
): string {
  if (!hidden?.length) return inlineText(node, line.from, line.to);
  let text = '';
  for (const [from, to] of shownRanges(hidden, line.from, line.to))
    text += inlineText(node, from, to);
  return text;
}
