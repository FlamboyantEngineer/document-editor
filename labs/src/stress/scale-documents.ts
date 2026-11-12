// The scale lab's documents: plain text blocks in large numbers, the same on every load, so the
// performance harness measures the editor at the sizes its budgets name rather than the content.

import type { DocumentFile, StoredNode } from '../../../src/model/index.js';

const WORDS = (
  'a quiet river runs past the old mill where the village keeps its records of every season and ' +
  'the harvest that followed while the bell in the square counts the hours for travellers who ' +
  'stop to rest under the trees before the road climbs into the hills beyond the farms'
).split(' ');

// A block's text: three to five sentences, picked by its index so every load is the same.
function blockText(index: number): string {
  const sentences = 3 + (index % 3);
  return Array.from({ length: sentences }, (_, sentence) => {
    const start = (index * 7 + sentence * 13) % WORDS.length;
    const words = Array.from(
      { length: 10 + ((index + sentence) % 8) },
      (_, word) => WORDS[(start + word) % WORDS.length],
    ).join(' ');
    return `${words.charAt(0).toUpperCase()}${words.slice(1)}.`;
  }).join(' ');
}

const paragraph = (index: number): StoredNode => ({
  type: 'paragraph',
  content: [{ type: 'text', text: blockText(index) }],
});

// A section's blocks: a heading every twenty blocks, paragraphs between.
function blocks(count: number, offset = 0): StoredNode[] {
  return Array.from({ length: count }, (_, index) =>
    index % 20 === 0
      ? {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: `Part ${String((offset + index) / 20 + 1)}` }],
        }
      : paragraph(offset + index),
  );
}

/** One section of `count` blocks. */
export function singleSectionDocument(count: number): DocumentFile {
  return { formatVersion: 1, sections: [{ name: null, content: blocks(count) }] };
}

/** `sections` sections of `count` blocks each. */
export function sectionsDocument(sections: number, count: number): DocumentFile {
  return {
    formatVersion: 1,
    sections: Array.from({ length: sections }, (_, index) => ({
      name: null,
      content: blocks(count, index * count),
    })),
  };
}
