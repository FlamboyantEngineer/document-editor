import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import type { DocumentFile, StoredNode } from './document-format.js';
import { readDocumentFile, writeDocumentFile } from './document-format-convert.js';
import { writeMarkdown } from './markdown.js';

const text = (value: string, ...marks: string[]): StoredNode => ({
  type: 'text',
  text: value,
  ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}),
});
const paragraph = (...content: StoredNode[]): StoredNode => ({ type: 'paragraph', content });
const cell = (type: string, value: string): StoredNode => ({
  type,
  content: [paragraph(text(value))],
});

const FILE: DocumentFile = {
  formatVersion: 1,
  sections: [
    {
      name: null,
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [text('Power')] },
        paragraph(
          text('Supply '),
          text('must', 'bold'),
          text(' stay '),
          { type: 'text', text: 'above', marks: [{ type: 'deletion' }] },
          { type: 'text', text: 'over', marks: [{ type: 'insertion' }] },
          text(' 5 V'),
          { type: 'footnote', attrs: { id: 'n1' }, content: [text('At the connector.')] },
          text(' and '),
          { type: 'math', attrs: { source: 'E=mc^2' } },
          text('.'),
        ),
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [paragraph(text('One'))] },
            { type: 'listItem', content: [paragraph(text('Two'))] },
          ],
        },
        { type: 'codeBlock', attrs: { language: 'ts' }, content: [text('let a = 1;')] },
        {
          type: 'table',
          attrs: { caption: 'Limits' },
          content: [
            {
              type: 'tableRow',
              content: [cell('tableHeader', 'Item'), cell('tableHeader', 'Max')],
            },
            { type: 'tableRow', content: [cell('tableCell', 'Volt'), cell('tableCell', '5')] },
          ],
        },
        { type: 'figure', attrs: { src: 'board.png', alt: 'Board', caption: 'The board' } },
      ],
    },
  ],
};

// A document with inline and display math, as the editor stores it.
function storedMath(): DocumentFile {
  const stored: DocumentFile = {
    formatVersion: 1,
    sections: [
      {
        name: null,
        content: [
          { type: 'paragraph', content: [text('So '), { type: 'math', attrs: { source: 'a^2' } }] },
          { type: 'mathBlock', attrs: { source: 'b_1' } },
        ],
      },
    ],
  };
  return writeDocumentFile(readDocumentFile(stored, documentSchema));
}

describe('writeMarkdown', () => {
  it('DOCE-FORMAT-4.1 writes headings, formats, lists, code, tables, figures and footnotes', () => {
    expect(writeMarkdown(FILE)).toBe(
      [
        '## Power',
        '',
        'Supply **must** stay over 5 V[^1] and $E=mc^2$.',
        '',
        '- One',
        '- Two',
        '',
        '```ts',
        'let a = 1;',
        '```',
        '',
        '*Limits*',
        '',
        '| Item | Max |',
        '| --- | --- |',
        '| Volt | 5 |',
        '',
        '![Board](board.png)',
        '',
        '*The board*',
        '',
        '[^1]: At the connector.',
        '',
      ].join('\n'),
    );
  });

  it('DOCE-FORMAT-4.1 writes the source of the math a stored document holds', () => {
    const markdown = writeMarkdown(storedMath());
    expect(markdown).toContain('So $a^2$');
    expect(markdown).toContain('$$\nb_1\n$$');
  });

  it('DOCE-FORMAT-4.2 writes the suggestions rejected when asked, escaping what reads as Markdown', () => {
    const markdown = writeMarkdown(FILE, { suggestions: 'rejected' });
    expect(markdown).toContain('stay above 5 V');
    const escaped = writeMarkdown({
      formatVersion: 1,
      sections: [{ name: null, content: [paragraph(text('a*b_c [d]'))] }],
    });
    expect(escaped).toBe('a\\*b\\_c \\[d\\]\n');
  });
});
