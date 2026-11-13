import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import type { DocumentFile, StoredNode } from './document-format.js';
import { readDocumentFile } from './document-format-convert.js';
import { writeDocumentFile } from './document-format-write.js';
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
  return writeDocumentFile(readDocumentFile(stored, documentSchema).doc);
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

  const written = (...content: StoredNode[]) =>
    writeMarkdown({ formatVersion: 1, sections: [{ name: null, content }] });

  it('DOCE-FORMAT-4.2 escapes what would start a block at the start of a line', () => {
    const lines: [string, string][] = [
      ['1. Not a list', '1\\. Not a list'],
      ['12) Nor this', '12\\) Nor this'],
      ['# Not a heading', '\\# Not a heading'],
      ['- Not a bullet', '\\- Not a bullet'],
      ['+ Nor this', '\\+ Nor this'],
      ['---', '\\---'],
      ['===', '\\==='],
      // Text that starts no block is left as it is.
      ['#tag', '#tag'],
      ['-5 degrees', '-5 degrees'],
      ['1.5 volts', '1.5 volts'],
    ];
    expect(written(...lines.map(([line]) => paragraph(text(line))))).toBe(
      `${lines.map(([, escaped]) => escaped).join('\n\n')}\n`,
    );
    // A line after a line break starts a block as the first line does.
    expect(written(paragraph(text('Title'), { type: 'lineBreak' }, text('# Second')))).toBe(
      'Title\\\n\\# Second\n',
    );
  });

  it('DOCE-FORMAT-4.2 keeps the spaces at the edges of marked text outside its markers', () => {
    const linked: StoredNode = {
      type: 'text',
      text: 'site ',
      marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
    };
    expect(written(paragraph(text('Hello ', 'bold'), text('world')))).toBe('**Hello** world\n');
    expect(written(paragraph(text('a'), text(' b ', 'italic', 'strike'), text('c')))).toBe(
      'a ~~*b*~~ c\n',
    );
    expect(written(paragraph(linked, text('next')))).toBe('[site](https://example.com) next\n');
    expect(written(paragraph(text('a'), text(' ', 'bold'), text('b')))).toBe('a b\n');
  });

  it('DOCE-FORMAT-4.2 escapes a pipe in code and math inside a table', () => {
    const row = (...cells: StoredNode[]): StoredNode => ({
      type: 'tableRow',
      content: cells.map((content) => ({ type: 'tableCell', content: [paragraph(content)] })),
    });
    const markdown = written({
      type: 'table',
      content: [
        row(text('Key'), text('Use')),
        row(text('a|b', 'code'), { type: 'math', attrs: { source: 'x|y' } }),
      ],
    });
    expect(markdown).toBe('| Key | Use |\n| --- | --- |\n| `a\\|b` | $x\\|y$ |\n');
    // Outside a table a pipe in code is the code's own.
    expect(written(paragraph(text('a|b', 'code')))).toBe('`a|b`\n');
  });

  it('DOCE-FORMAT-4.3 leaves out the blocks a suggestion inserts or deletes, as decided', () => {
    const suggested = (kind: string, node: StoredNode): StoredNode => ({
      ...node,
      attrs: { ...node.attrs, suggestionKind: kind, suggestionId: `s-${kind}` },
    });
    const file: DocumentFile = {
      formatVersion: 1,
      sections: [
        {
          name: null,
          content: [
            paragraph(text('Kept')),
            suggested('insertion', { type: 'figure', attrs: { src: 'new.png', alt: 'New' } }),
            suggested('deletion', { type: 'figure', attrs: { src: 'old.png', alt: 'Old' } }),
            {
              type: 'bulletList',
              content: [
                { type: 'listItem', content: [paragraph(text('One'))] },
                { type: 'listItem', content: [suggested('insertion', paragraph(text('Two')))] },
                { type: 'listItem', content: [paragraph(text('Three'))] },
              ],
            },
          ],
        },
      ],
    };
    expect(writeMarkdown(file)).toBe('Kept\n\n![New](new.png)\n\n- One\n- Two\n- Three\n');
    expect(writeMarkdown(file, { suggestions: 'rejected' })).toBe(
      'Kept\n\n![Old](old.png)\n\n- One\n- Three\n',
    );
  });
});
