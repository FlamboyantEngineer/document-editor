// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { StoredNode } from './document-format.js';
import { writeMarkdown } from './markdown.js';
import { readMarkdown } from './markdown-read.js';

const text = (value: string, ...marks: string[]): StoredNode => ({
  type: 'text',
  text: value,
  ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}),
});
const paragraph = (...content: StoredNode[]): StoredNode => ({ type: 'paragraph', content });
const written = (content: StoredNode[]) =>
  writeMarkdown({ formatVersion: 1, sections: [{ name: null, content }] });
const readBack = (content: StoredNode[]) =>
  readMarkdown(written(content)).file.sections[0]?.content ?? [];
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
