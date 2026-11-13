// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { StoredNode } from './document-format.js';
import { type MarkdownOptions, writeMarkdown } from './markdown.js';

const text = (value: string, ...marks: string[]): StoredNode => ({
  type: 'text',
  text: value,
  ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}),
});
const paragraph = (...content: StoredNode[]): StoredNode => ({ type: 'paragraph', content });
const written = (content: StoredNode[], options?: MarkdownOptions) =>
  writeMarkdown({ formatVersion: 1, sections: [{ name: null, content }] }, options);
const cell = (value: string, attrs?: Record<string, unknown>): StoredNode => ({
  type: 'tableCell',
  ...(attrs ? { attrs } : {}),
  content: [paragraph(text(value))],
});
const row = (...cells: StoredNode[]): StoredNode => ({ type: 'tableRow', content: cells });

describe('writeMarkdown fidelity', () => {
  it('DOCE-FORMAT-4.4 fences code with a longer run of backticks than it holds', () => {
    const code = (value: string): StoredNode => ({
      type: 'codeBlock',
      attrs: { language: 'md', caption: 'Fences' },
      content: [text(value)],
    });
    expect(written([code('```\nnested\n```')])).toBe(
      '````md\n```\nnested\n```\n````\n\n*Fences*\n',
    );
    expect(written([code('````')])).toContain('`````md\n````\n`````');
    expect(written([paragraph(text('a``b', 'code'))])).toBe('```a``b```\n');
    expect(written([paragraph(text('`tick', 'code'))])).toBe('`` `tick ``\n');
  });

  it('DOCE-FORMAT-4.4 writes a link address and title so that nothing in them ends the link', () => {
    const linked = (href: string, title?: string): StoredNode => ({
      type: 'text',
      text: 'site',
      marks: [{ type: 'link', attrs: { href, ...(title ? { title } : {}) } }],
    });
    expect(written([paragraph(linked('https://example.com/a b_(c)'))])).toBe(
      '[site](https://example.com/a%20b_\\(c\\))\n',
    );
    expect(written([paragraph(linked('https://example.com', 'Say "hi"'))])).toBe(
      '[site](https://example.com "Say \\"hi\\"")\n',
    );
    // A code span in a link keeps its link.
    const code: StoredNode = {
      type: 'text',
      text: 'run()',
      marks: [{ type: 'code' }, { type: 'link', attrs: { href: '#run' } }],
    };
    expect(written([paragraph(code)])).toBe('[`run()`](#run)\n');
  });

  it('DOCE-FORMAT-4.4 escapes an entity and a closing run of number signs in a heading', () => {
    expect(written([paragraph(text('Fish &amp; chips & peas'))])).toBe(
      'Fish \\&amp; chips & peas\n',
    );
    const heading: StoredNode = { type: 'heading', attrs: { level: 2 }, content: [text('In C #')] };
    expect(written([heading])).toBe('## In C \\#\n');
  });

  it('DOCE-FORMAT-4.4 writes a merged cell in its first place and leaves the places it covers empty', () => {
    const table: StoredNode = {
      type: 'table',
      content: [
        row(cell('Span', { colspan: 2 }), cell('C')),
        row(cell('Tall', { rowspan: 2 }), cell('B2'), cell('C2')),
        row(cell('B3'), cell('C3')),
        row(cell('A4'), cell('B4'), cell('Last', { rowspan: 2 })),
        row(cell('A5'), cell('B5')),
      ],
    };
    expect(written([table])).toBe(
      [
        '| Span |  | C |',
        '| --- | --- | --- |',
        '| Tall | B2 | C2 |',
        '|  | B3 | C3 |',
        '| A4 | B4 | Last |',
        '| A5 | B5 |  |',
        '',
      ].join('\n'),
    );
  });

  it('DOCE-FORMAT-4.4 writes a cell of several paragraphs or a line break on its one line', () => {
    const table: StoredNode = {
      type: 'table',
      content: [
        row(cell('Head')),
        row({
          type: 'tableCell',
          content: [
            paragraph(text('One'), { type: 'lineBreak' }, text('two')),
            paragraph(text('Three')),
          ],
        }),
      ],
    };
    expect(written([table])).toBe('| Head |\n| --- |\n| One<br>two<br>Three |\n');
  });

  it('DOCE-FORMAT-4.4 writes images and figures stored by asset at the address the host gives', () => {
    const asset = ({ id, revision }: { id: string; revision?: string }) =>
      id === 'missing' ? null : `https://assets.example.com/${id}/${revision ?? 'latest'}.png`;
    const content: StoredNode[] = [
      {
        type: 'figure',
        attrs: { assetId: 'a1', assetRevision: 'r2', alt: 'Map', caption: 'Site' },
      },
      paragraph(text('Icon '), { type: 'image', attrs: { assetId: 'a2', alt: 'Icon' } }),
      paragraph({ type: 'image', attrs: { src: 'local.png', alt: 'Local' } }),
      { type: 'figure', attrs: { assetId: 'missing', caption: 'Lost' } },
    ];
    expect(written(content, { values: { asset } })).toBe(
      [
        '![Map](https://assets.example.com/a1/r2.png)',
        '',
        '*Site*',
        '',
        'Icon ![Icon](https://assets.example.com/a2/latest.png)',
        '',
        '![Local](local.png)',
        '',
        '*Lost*',
        '',
      ].join('\n'),
    );
    // Without a host's addresses, a figure stored by asset is written as its caption alone.
    expect(written(content.slice(0, 1))).toBe('*Site*\n');
  });

  it('DOCE-FORMAT-4.5 writes the values of variables and template blocks the host gives', () => {
    const values = { variable: (key: string) => ({ 'document.title': 'Garden *log*' })[key] };
    const content: StoredNode[] = [
      {
        type: 'templateBlock',
        attrs: { source: '<h1>{{ document.title }}</h1><p>By {{document.owner}} &amp; team</p>' },
      },
      paragraph(
        text('Title: '),
        { type: 'variable', attrs: { key: 'document.title' } },
        text(', owner: '),
        { type: 'variable', attrs: { key: 'document.owner' } },
      ),
      { type: 'templateBlock' },
    ];
    expect(written(content, { values })).toBe(
      [
        'Garden \\*log\\*',
        '',
        'By {{document.owner}} & team',
        '',
        'Title: Garden \\*log\\*, owner: {{document.owner}}',
        '',
      ].join('\n'),
    );
  });

  it('DOCE-FORMAT-4.5 writes a format change as it was before when the suggestions are rejected', () => {
    const changed: StoredNode = {
      type: 'text',
      text: 'loud',
      marks: [{ type: 'bold' }, { type: 'formatChange', attrs: { before: [{ type: 'italic' }] } }],
    };
    expect(written([paragraph(changed)])).toBe('**loud**\n');
    expect(written([paragraph(changed)], { suggestions: 'rejected' })).toBe('*loud*\n');
  });
});
