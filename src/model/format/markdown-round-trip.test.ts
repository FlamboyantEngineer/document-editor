// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { StoredNode } from './document-format.js';
import { type MarkdownOptions, writeMarkdown } from './markdown.js';
import { readMarkdown } from './markdown-read.js';

const text = (value: string, ...marks: string[]): StoredNode => ({
  type: 'text',
  text: value,
  ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}),
});
const paragraph = (...content: StoredNode[]): StoredNode => ({ type: 'paragraph', content });
const written = (content: StoredNode[], options?: MarkdownOptions) =>
  writeMarkdown({ formatVersion: 1, sections: [{ name: null, content }] }, options);
const readBack = (content: StoredNode[], options?: MarkdownOptions) =>
  readMarkdown(written(content, options)).file.sections[0]?.content ?? [];
const code = (value: string): StoredNode => ({ type: 'codeBlock', content: [text(value)] });
const math = (source: string): StoredNode => ({ type: 'math', attrs: { source } });

describe('writing then reading Markdown', () => {
  it('DOCE-FORMAT-4.2 reads back text holding dollar signs and double braces as text', () => {
    const content = [
      paragraph(text('Tickets cost $5-$10 each, $x$ is text.')),
      paragraph(text('Write {{not.a.variable}} or {{{three}}}.')),
      paragraph(text('A '), { type: 'variable', attrs: { key: 'page.current' } }, text(' here.')),
    ];
    expect(readBack(content)).toEqual(content);
  });

  it('DOCE-FORMAT-4.1 DOCE-IMPORT-4.3 reads back a rich caption under a figure and over a table', () => {
    const caption: StoredNode = {
      type: 'caption',
      content: [
        text('Flow '),
        text('by year', 'bold'),
        { type: 'footnote', content: [text('Measured.')] },
      ],
    };
    const body = [
      { type: 'tableRow', content: [{ type: 'tableCell', content: [paragraph(text('Cell'))] }] },
    ];
    const content: StoredNode[] = [
      {
        type: 'figure',
        attrs: { src: 'https://example.com/a.png', alt: 'Chart' },
        content: [caption],
      },
      { type: 'table', content: [caption, ...body] },
    ];
    const back = readBack(content);
    expect(back.map((node) => node.content?.[0])).toEqual([caption, caption]);
    expect(written(back)).toBe(written(content));
  });

  it('DOCE-FORMAT-4.4 reads back a quote of several blocks as one quote', () => {
    const content = [
      {
        type: 'blockquote',
        content: [paragraph(text('first')), paragraph(text('second')), code('a\n\nb')],
      },
    ];
    expect(written(content)).toBe('> first\n>\n> second\n>\n> ```\n> a\n>\n> b\n> ```\n');
    expect(readBack(content)).toEqual(content);
  });

  it('DOCE-IMPORT-4.4 reads back a list item whose code holds blank lines', () => {
    const content = [
      {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [paragraph(text('one')), code('a\n\n\nb')] },
          { type: 'listItem', content: [paragraph(text('two'))] },
        ],
      },
    ];
    expect(readBack(content)).toEqual(content);
  });

  it('DOCE-IMPORT-4.4 reads back footnote and link definition syntax inside nested fences', () => {
    const definitionCode = code('[link]: https://example.test\n[^note]: example text');
    const content: StoredNode[] = [
      {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [paragraph(text('example')), definitionCode] },
          {
            type: 'listItem',
            content: [{ type: 'blockquote', content: [definitionCode] }],
          },
        ],
      },
      paragraph(text('See [link] and [^note].')),
    ];
    expect(readBack(content)).toEqual(content);
  });

  it('DOCE-FORMAT-4.4 reads a multiline footnote back with every line inside the note', () => {
    const content = [
      paragraph(text('Notes'), {
        type: 'footnote',
        content: [
          text('First line'),
          { type: 'lineBreak' },
          text('Second line', 'bold'),
          { type: 'lineBreak' },
          { type: 'lineBreak' },
          text('Last line'),
        ],
      }),
      paragraph(text('Body')),
    ];
    expect(readBack(content)).toEqual(content);
    expect(written(content)).toContain('[^1]: First line\\\n    **Second line**');
  });

  it('DOCE-FORMAT-4.2 preserves formatting across text split by a comment anchor', () => {
    const anchor = { type: 'comment', attrs: { thread: 'thread-01' } };
    const content = [
      paragraph(
        text('Bold ', 'bold'),
        { type: 'text', text: 'across a', marks: [{ type: 'bold' }, anchor] },
        text(' comment.', 'bold'),
      ),
    ];
    expect(written(content)).toBe('**Bold across a comment.**\n');
    expect(readBack(content)).toEqual([paragraph(text('Bold across a comment.', 'bold'))]);
  });

  it('DOCE-FORMAT-4.5 keeps literal angle brackets, entities and braces in variable values', () => {
    const literal = '<tag> &amp; &lt;';
    const options = {
      values: { variable: (key: string) => (key === 'literal' ? literal : '{{token}}') },
    };
    const content: StoredNode[] = [
      { type: 'templateBlock', attrs: { source: '<p>&lt;source&gt; {{ literal }} &amp;</p>' } },
      paragraph({ type: 'variable', attrs: { key: 'token' } }),
    ];
    expect(readBack(content, options)).toEqual([
      paragraph(text('<source> <tag> &amp; &lt; &')),
      paragraph(text('{{token}}')),
    ]);
  });

  it('DOCE-FORMAT-4.4 reads back a heading with a line break as one heading', () => {
    const content = [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [text('a'), { type: 'lineBreak' }, text('b')],
      },
    ];
    expect(written(content)).toBe('## a<br>b\n');
    expect(readBack(content)).toEqual(content);
  });

  it('DOCE-FORMAT-4.4 reads back a paragraph starting with spaces as a paragraph, not code', () => {
    expect(readBack([paragraph(text('    indented text'))])).toEqual([
      paragraph(text('indented text')),
    ]);
  });

  it('DOCE-FORMAT-4.4 reads back inline math holding a dollar sign', () => {
    expect(written([paragraph(math('a$b'))])).toBe('$a\\$b$\n');
    expect(readBack([paragraph(math('a$b'))])).toEqual([paragraph(math('a\\$b'))]);
    const escaped = [paragraph(text('x '), math('\\$5 + y'), text(' z'))];
    expect(readBack(escaped)).toEqual(escaped);
  });
});
