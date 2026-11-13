// The width of a character as the browser deletes and steps over it: a grapheme cluster, such as a
// flag, a family emoji or a letter with its accents, rather than one UTF-16 unit.

import type { ResolvedPos } from 'prosemirror-model';

// How far either side of a position a cluster is looked for, in characters.
const WINDOW = 16;

const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

// The surrogate rule, without a segmenter: a pair is one character.
function surrogateWidth(text: string, direction: -1 | 1): number {
  const pair = direction < 0 ? text.slice(-2) : text.slice(0, 2);
  return pair.length === 2 && /[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(pair) ? 2 : 1;
}

/**
 * How many positions the character before (-1) or after (1) a position in a textblock takes: its
 * grapheme cluster, within the textblock; 1 where an inline node stands next to it.
 */
export function characterWidth($pos: ResolvedPos, direction: -1 | 1): number {
  const { pos } = $pos;
  const [from, to] =
    direction < 0
      ? [Math.max($pos.start(), pos - WINDOW), pos]
      : [pos, Math.min($pos.end(), pos + WINDOW)];
  if (from === to) return 1;
  // Each leaf as one character, so the text's offsets are positions; a node with content of its
  // own, which takes more positions than characters, leaves the width at one.
  const text = $pos.doc.textBetween(from, to, undefined, '￼');
  if (text.length !== to - from) return 1;
  if (!segmenter) return surrogateWidth(text, direction);
  const clusters = [...segmenter.segment(text)];
  const cluster = direction < 0 ? clusters.at(-1) : clusters[0];
  return cluster && !cluster.segment.includes('￼') ? cluster.segment.length : 1;
}
