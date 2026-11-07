// How many words a document's content holds, and how long it takes to read.

import type { Node as ProseMirrorNode } from 'prosemirror-model';

const REGIONS = new Set(['page_header', 'page_footer']);

/** The words in a document's text, its footnotes included and its page headers and footers not. */
export function countWords(doc: ProseMirrorNode): number {
  let words = 0;
  doc.descendants((node) => {
    if (REGIONS.has(node.type.name)) return false;
    if (!node.isTextblock) return true;
    words += node.textBetween(0, node.content.size, ' ', ' ').match(/\S+/g)?.length ?? 0;
    return false;
  });
  return words;
}

/** The whole minutes reading some words takes, at least one, at a pace of words a minute. */
export function readingMinutes(words: number, wordsPerMinute = 200): number {
  return Math.max(1, Math.ceil(words / wordsPerMinute));
}
