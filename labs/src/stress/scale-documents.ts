// The scale lab's documents: plain text blocks in large numbers, the same on every load, so the
// performance harness measures the editor at the sizes its budgets name rather than the content.

import type { CommentThread } from '../../../src/host/index.js';
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

// A short list of two to eight items, ordered or not by its index, every third with a nested list
// of two items in its second item; each item's text is one sentence.
function shortList(index: number): StoredNode {
  const item = (text: string, nested?: StoredNode): StoredNode => ({
    type: 'listItem',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text }] },
      ...(nested ? [nested] : []),
    ],
  });
  const sentence = (at: number) => blockText(at).split('. ')[0] ?? '';
  const nested = (at: number): StoredNode => ({
    type: 'bulletList',
    content: [item(sentence(at)), item(sentence(at + 1))],
  });
  const count = 2 + (index % 7);
  return {
    type: index % 2 === 0 ? 'orderedList' : 'bulletList',
    content: Array.from({ length: count }, (_, at) =>
      item(sentence(index * 11 + at), at === 1 && index % 3 === 0 ? nested(index * 13) : undefined),
    ),
  };
}

/**
 * One section of `count` short lists, a paragraph before each and a heading every twenty: lists
 * of eight items or fewer, to profile list pagination apart from long lists.
 */
export function shortListsDocument(count: number): DocumentFile {
  const content = Array.from({ length: count }, (_, index) => [
    ...(index % 20 === 0
      ? [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: `Lists ${String(index / 20 + 1)}` }],
          },
        ]
      : []),
    paragraph(index),
    shortList(index),
  ]).flat();
  return { formatVersion: 1, sections: [{ name: null, content }] };
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

// A paragraph whose first three words carry a comment thread's anchor.
function anchored(node: StoredNode, thread: string): StoredNode {
  const [first] = node.content ?? [];
  const text = first?.text ?? '';
  const cut = text.split(' ', 3).join(' ').length;
  return {
    ...node,
    content: [
      {
        type: 'text',
        text: text.slice(0, cut),
        marks: [{ type: 'comment', attrs: { thread, state: 'open' } }],
      },
      { type: 'text', text: text.slice(cut) },
    ],
  };
}

/**
 * One section of `count` blocks with `threads` open comment threads spread evenly over its
 * paragraphs, and the threads themselves, each with one comment.
 */
export function reviewDocument(
  count: number,
  threads: number,
): { file: DocumentFile; threads: CommentThread[] } {
  const content = blocks(count);
  const paragraphs = content.flatMap((node, index) => (node.type === 'paragraph' ? [index] : []));
  const step = Math.max(1, Math.floor(paragraphs.length / threads));
  const stored: CommentThread[] = [];
  for (let at = 0; at < paragraphs.length && stored.length < threads; at += step) {
    const index = paragraphs[at] ?? 0;
    const id = `thread-${String(stored.length + 1).padStart(4, '0')}`;
    const node = content[index];
    if (!node) continue;
    const marked = anchored(node, id);
    content[index] = marked;
    stored.push({
      id,
      state: 'open',
      quote: marked.content?.[0]?.text ?? '',
      suggestion: null,
      entries: [
        {
          id: `${id}-1`,
          author: 'reviewer',
          text: `Check paragraph ${String(index + 1)}.`,
          createdAt: '2026-01-05T09:30:00Z',
        },
      ],
    });
  }
  return { file: { formatVersion: 1, sections: [{ name: null, content }] }, threads: stored };
}
