// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { DocumentFile, StoredNode } from './document-format.js';
import { type MarkdownThread, writeMarkdown } from './markdown.js';

const text = (value: string, ...marks: StoredNode['marks'] & object): StoredNode => ({
  type: 'text',
  text: value,
  ...(marks.length ? { marks } : {}),
});
const paragraph = (...content: StoredNode[]): StoredNode => ({ type: 'paragraph', content });
const mark = (type: string, attrs: Record<string, unknown>) => ({ type, attrs });

const FILE: DocumentFile = {
  formatVersion: 1,
  sections: [
    {
      name: null,
      content: [
        paragraph(
          text('The '),
          text('north bed', mark('comment', { thread: 't-north' })),
          text(' needs '),
          text('little', mark('deletion', { thread: 's-water', author: 'p-ada' })),
          text('more', mark('insertion', { thread: 's-water', author: 'p-ada' })),
          text(' water '),
          text('daily', mark('insertion', { id: 's-daily', author: 'p-bo' })),
          text('.'),
        ),
        paragraph(
          text('Shade', mark('comment', { thread: 't-shade', state: 'resolved' })),
          text(' and '),
          text('soil', mark('formatChange', { thread: 's-soil', before: [] }), { type: 'bold' }),
        ),
        {
          type: 'figure',
          attrs: { src: 'bed.png', alt: 'Bed', suggestionKind: 'insertion', suggestionId: 's-fig' },
        },
      ],
    },
  ],
};

const THREADS: MarkdownThread[] = [
  {
    id: 'doc',
    state: 'open',
    quote: '',
    scope: 'document',
    entries: [{ author: 'p-bo', text: 'Ready for review.', createdAt: '2026-11-03T09:00:00Z' }],
  },
  {
    id: 't-shade',
    state: 'resolved',
    quote: 'Shade',
    entries: [{ author: 'p-ada', text: 'Fixed.', createdAt: '2026-11-02T10:00:00Z' }],
  },
  {
    id: 't-north',
    state: 'open',
    quote: 'north bed',
    entries: [
      { author: 'p-ada', text: 'Which bed?\n- the old one', createdAt: '2026-11-01T08:30:00Z' },
      { author: 'p-bo', text: 'The *old* one.', createdAt: '2026-11-01T09:00:00Z' },
      { author: 'p-bot', text: '', status: 'pending' },
    ],
  },
  // A thread the editor started for a suggestion, with no comment, is not listed.
  { id: 's-water', state: 'open', quote: 'little', entries: [] },
];

const person = (id: string) => ({ 'p-ada': 'Ada', 'p-bo': 'Bo' })[id];

describe('writeMarkdown title, front matter, threads and suggestions', () => {
  it('DOCE-FORMAT-4.6 writes front matter and a title before the text', () => {
    const markdown = writeMarkdown(
      { formatVersion: 1, sections: [{ name: null, content: [paragraph(text('Body'))] }] },
      {
        title: 'Garden #1 *plan*',
        frontMatter: {
          title: 'Garden: "plan"',
          tags: ['soil', 'water'],
          pages: 3,
          draft: true,
          yes: null,
          'first name': 'Ada',
          left: undefined,
        },
      },
    );
    expect(markdown).toBe(
      [
        '---',
        'title: "Garden: \\"plan\\""',
        'tags: ["soil","water"]',
        'pages: 3',
        'draft: true',
        '"yes": null',
        '"first name": "Ada"',
        '---',
        '',
        '# Garden #1 \\*plan\\*',
        '',
        'Body',
        '',
      ].join('\n'),
    );
  });

  it('DOCE-FORMAT-4.7 lists the comment threads in the order of their text, with their comments', () => {
    const markdown = writeMarkdown(FILE, { threads: THREADS, person });
    expect(markdown.slice(markdown.indexOf('## Comments'))).toBe(
      [
        '## Comments',
        '',
        '- On "north bed"',
        '  - **Ada** · 2026-11-01: Which bed?',
        '    \\- the old one',
        '  - **Bo** · 2026-11-01: The \\*old\\* one.',
        '- On "Shade" (resolved)',
        '  - **Ada** · 2026-11-02: Fixed.',
        '- On the document',
        '  - **Bo** · 2026-11-03: Ready for review.',
        '',
      ].join('\n'),
    );
  });

  it('DOCE-FORMAT-4.8 lists the suggestions in the order of their place, with their authors', () => {
    const markdown = writeMarkdown(FILE, { suggestionList: true, person });
    expect(markdown.slice(markdown.indexOf('## Suggestions'))).toBe(
      [
        '## Suggestions',
        '',
        '- Replace "little" with "more" (Ada)',
        '- Insert "daily" (Bo)',
        '- Format "soil"',
        '- Insert "\\[figure: Bed\\]"',
        '',
      ].join('\n'),
    );
    // The text itself is written with the suggestions decided.
    expect(markdown).toContain('needs more water daily.');
  });

  it('DOCE-FORMAT-4.8 writes neither list when there is nothing to list', () => {
    const plain: DocumentFile = {
      formatVersion: 1,
      sections: [{ name: null, content: [paragraph(text('Plain'))] }],
    };
    expect(writeMarkdown(plain, { threads: [], suggestionList: true })).toBe('Plain\n');
  });
});
