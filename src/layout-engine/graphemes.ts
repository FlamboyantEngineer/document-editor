// Grapheme cluster boundaries in a text block's content, as the browser deletes, steps over and
// draws characters: a flag, a family emoji or a letter with any number of accents is one
// character, however many UTF-16 units it takes. A cluster has no length limit, so its text is read
// in windows that grow until the boundary found cannot depend on text outside them.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { graphemeSegmenter } from '../utils/segmentation.js';

/** The character that stands for an inline node other than text, one per position it takes. */
export const OBJECT_CHARACTER = '￼';

// How many positions the first window reads; each further window reads twice as many.
const FIRST_WINDOW = 16;

// Characters after which a boundary depends on text further back: an extender (an Indic conjunct,
// GB9c, also one carried through a halfwidth voiced sound mark), the zero width joiner (an emoji
// sequence, GB11) and a regional indicator (a flag's pair, GB12 and GB13); marks and emoji
// modifiers too, whatever the Unicode version. After any other character the boundary depends on
// that pair alone.
const LOOKS_BACK = /[\p{Grapheme_Extend}\p{M}\u200D\p{Emoji_Modifier}\p{Regional_Indicator}]/u;

/**
 * The text of a block's content between two offsets, one character for each position: text as it
 * is, and each position of any other inline node as the object character.
 */
export function positionText(block: ProseMirrorNode, from: number, to: number): string {
  const { content } = block;
  let text = '';
  // Children are walked by their sizes alone up to the window, and none is read past it.
  for (let index = 0, offset = 0; index < content.childCount && offset < to; index += 1) {
    const child = content.child(index);
    const [start, end] = [Math.max(from, offset), Math.min(to, offset + child.nodeSize)];
    if (end > start && child.isText) text += (child.text ?? '').slice(start - offset, end - offset);
    else if (end > start) text += OBJECT_CHARACTER.repeat(end - start);
    offset += child.nodeSize;
  }
  return text;
}

/**
 * Where the grapheme cluster ending at `at` in a block's content starts, no further back than
 * `min`, the start of the content by default.
 */
export function clusterStart(block: ProseMirrorNode, at: number, min = 0): number {
  for (let size = FIRST_WINDOW; ; size *= 2) {
    const from = Math.max(min, at - size);
    if (from === at) return at;
    const text = positionText(block, from, at);
    const last = graphemeSegmenter()
      .segment(text)
      .containing(text.length - 1);
    if (!last) return at;
    if (from === min) return from + last.index;
    // The boundary before the cluster stands without the text before the window only when the
    // window holds the whole character before it, and that character looks no further back.
    const before = characterBefore(text, last.index);
    if (before !== null && !LOOKS_BACK.test(before)) return from + last.index;
  }
}

// The code point that ends just before an index of a text; null for none or half a pair.
function characterBefore(text: string, index: number): string | null {
  if (index < 1) return null;
  const unit = text.charCodeAt(index - 1);
  if (unit < 0xdc00 || unit > 0xdfff) return text.charAt(index - 1);
  return index >= 2 ? text.slice(index - 2, index) : null;
}

/**
 * Where the grapheme cluster starting at `at` in a block's content ends, no further than `max`,
 * the end of the content by default.
 */
export function clusterEnd(block: ProseMirrorNode, at: number, max = block.content.size): number {
  for (let size = FIRST_WINDOW; ; size *= 2) {
    const to = Math.min(max, at + size);
    if (to === at) return at;
    const text = positionText(block, at, to);
    const first = graphemeSegmenter().segment(text).containing(0);
    if (!first) return at;
    // The boundary after the cluster stands only when the window holds the whole character after
    // it: a cluster that reaches the window's end, or half a pair before it, may go on past it.
    const after = text.charCodeAt(first.segment.length);
    const half = after >= 0xd800 && after <= 0xdbff && first.segment.length + 1 === text.length;
    if (to === max || (first.segment.length < text.length && !half)) {
      return at + first.segment.length;
    }
  }
}
