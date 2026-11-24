// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { importWarningGroup } from '../../import/import-warnings.js';
import { storedCaption } from '../schema/caption-content.js';
import { createDocumentSchema } from '../schema/document-schema.js';
import type { DocumentFile, StoredNode } from './document-format.js';
import { readDocumentFile } from './document-format-convert.js';
import { writeMarkdown } from './markdown.js';
import { readMarkdown } from './markdown-read.js';

const warning = (code: string, detail: string, count: number) => ({
  code,
  detail,
  count,
  group: importWarningGroup(code),
});

const documents = join(dirname(fileURLToPath(import.meta.url)), '../../../test/fixtures/documents');

// Documents whose Markdown the writer cannot give back exactly, and why.
const LOSSY: Readonly<Record<string, string>> = {
  'inline-images.json': 'the writer leaves inline images out, leaving the spaces around them',
  'table-rich-cells.json': "the writer puts a cell's code block and nested table on one line",
  'inline-geometry.json': "the writer puts a cell's code block on one line",
};

// Spaces at line ends, where the writer leaves the ones around content it does not write.
const trimmed = (markdown: string) => markdown.replace(/ +$/gm, '');

const blocksOf = (markdown: string) => readMarkdown(markdown).file.sections[0]?.content ?? [];
const text = (value: string, ...marks: string[]): StoredNode => ({
  type: 'text',
  text: value,
  ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}),
});
const paragraph = (...content: StoredNode[]): StoredNode => ({ type: 'paragraph', content });

describe('reading Markdown', () => {
  it('DOCE-IMPORT-4.1 reads headings, paragraphs, quotes, rules and code', () => {
    const blocks = blocksOf(
      [
        '---',
        'title: Ignored',
        '---',
        '# Title',
        '',
        'Sub',
        '---',
        '',
        '### Third ###',
        '',
        'One line',
        'and the next.',
        '',
        '> Quoted',
        '> > Deeper',
        '',
        '***',
        '',
        '```js',
        'let a = 1;',
        '',
        '```',
        '',
        '    indented',
        '',
        '$$',
        'x^2',
        '$$',
      ].join('\n'),
    );
    expect(blocks).toEqual([
      { type: 'heading', content: [text('Title')] },
      { type: 'heading', attrs: { level: 2 }, content: [text('Sub')] },
      { type: 'heading', attrs: { level: 3 }, content: [text('Third')] },
      paragraph(text('One line and the next.')),
      {
        type: 'blockquote',
        content: [
          paragraph(text('Quoted')),
          { type: 'blockquote', content: [paragraph(text('Deeper'))] },
        ],
      },
      { type: 'rule' },
      { type: 'codeBlock', attrs: { language: 'js' }, content: [text('let a = 1;\n')] },
      { type: 'codeBlock', content: [text('indented')] },
      { type: 'mathBlock', attrs: { source: 'x^2' } },
    ]);
  });

  it('DOCE-IMPORT-4.1 reads inline formats, links, math, variables and line breaks', () => {
    const [first] = blocksOf(
      '**Bold _both_** ~~gone~~ `a*b` [site](https://example.test "t") <u>u</u> x<sup>2</sup> $E=mc^2$ {{page.current}} \\* end\\\nnext  \nlast <https://example.test/a>',
    );
    const link = { type: 'link', attrs: { href: 'https://example.test' } };
    expect(first?.content).toEqual([
      text('Bold ', 'bold'),
      { type: 'text', text: 'both', marks: [{ type: 'italic' }, { type: 'bold' }] },
      text(' '),
      text('gone', 'strike'),
      text(' '),
      text('a*b', 'code'),
      text(' '),
      {
        type: 'text',
        text: 'site',
        marks: [{ type: 'link', attrs: { ...link.attrs, title: 't' } }],
      },
      text(' '),
      text('u', 'underline'),
      text(' x'),
      text('2', 'superscript'),
      text(' '),
      { type: 'math', attrs: { source: 'E=mc^2' } },
      text(' '),
      { type: 'variable', attrs: { key: 'page.current' } },
      text(' * end'),
      { type: 'lineBreak' },
      text('next'),
      { type: 'lineBreak' },
      text('last '),
      {
        type: 'text',
        text: 'https://example.test/a',
        marks: [{ type: 'link', attrs: { href: 'https://example.test/a' } }],
      },
    ]);
  });

  it('DOCE-IMPORT-4.1 reads nested lists, start numbers and items of several paragraphs', () => {
    const [bullets, numbers] = blocksOf(
      ['- One', '  - Inner', '- Two', '', '  More', '', '3. Third', '4. Fourth'].join('\n'),
    );
    expect(bullets).toEqual({
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            paragraph(text('One')),
            {
              type: 'bulletList',
              content: [{ type: 'listItem', content: [paragraph(text('Inner'))] }],
            },
          ],
        },
        { type: 'listItem', content: [paragraph(text('Two')), paragraph(text('More'))] },
      ],
    });
    expect(numbers).toMatchObject({ type: 'orderedList', attrs: { start: 3 } });
    expect(numbers?.content).toHaveLength(2);
  });

  it('DOCE-IMPORT-4.1 reads tables with their caption and alignment, and figures', () => {
    const [table, figure, plain] = blocksOf(
      [
        '*Rainfall*',
        '',
        '| Day | Rain |',
        '| --- | ---: |',
        '| Mon | 4 \\| 5 |',
        '',
        '![Plot](plot.png)',
        '',
        '*The plot*',
        '',
        '![Bare](bare.png)',
      ].join('\n'),
    );
    expect(table?.attrs).toBeUndefined();
    expect(table?.content?.[0]).toEqual(storedCaption('Rainfall'));
    expect(table?.content?.[1]?.content?.map((cell) => [cell.type, cell.attrs])).toEqual([
      ['tableHeader', undefined],
      ['tableHeader', { align: 'right' }],
    ]);
    expect(table?.content?.[2]?.content?.[1]?.content).toEqual([paragraph(text('4 | 5'))]);
    expect(figure).toEqual({
      type: 'figure',
      attrs: { src: 'plot.png', alt: 'Plot' },
      content: [storedCaption('The plot')],
    });
    expect(plain).toEqual({
      type: 'figure',
      attrs: { src: 'bare.png', alt: 'Bare', captionEnabled: false },
      content: [{ type: 'caption' }],
    });
  });

  it('DOCE-IMPORT-4.1 reads footnotes and reference links where they are cited', () => {
    const [cited] = blocksOf(
      [
        'A note[^n] and [a link][ref].',
        '',
        '[^n]: The *note*',
        '  goes on.',
        '',
        '[ref]: https://example.test',
      ].join('\n'),
    );
    expect(cited?.content).toEqual([
      text('A note'),
      { type: 'footnote', content: [text('The '), text('note', 'italic'), text(' goes on.')] },
      text(' and '),
      {
        type: 'text',
        text: 'a link',
        marks: [{ type: 'link', attrs: { href: 'https://example.test' } }],
      },
      text('.'),
    ]);
  });

  it('DOCE-IMPORT-4.2 leaves out HTML blocks and unknown tags with a warning', () => {
    const read = readMarkdown('<div>\nbox\n</div>\n\nText <span>kept</span> here.\n');
    expect(read.file.sections[0]?.content).toEqual([paragraph(text('Text kept here.'))]);
    expect(read.warnings).toEqual([
      warning('content-left-out', 'HTML block', 1),
      warning('content-left-out', '<span>', 2),
    ]);
    expect(readMarkdown('').file).toEqual({ formatVersion: 1, sections: [{ content: [] }] });
  });

  it('DOCE-IMPORT-4.1 DOCE-IMPORT-4.2 uses the first definitions even when they are in nested blocks', () => {
    const read = readMarkdown(
      [
        'Read [the link][ref] and [^nested] with <samp>context</samp>.',
        '',
        '- [^nested]: Note <kbd>inside a list</kbd>.',
        '',
        '> [ref]: https://example.test/first',
        '',
        '[^nested]: <abbr>Duplicate definition</abbr>',
        '',
        '[ref]: https://example.test/second',
        '',
        '<div>Last block</div>',
      ].join('\n'),
    );
    expect(read.file.sections[0]?.content[0]?.content).toEqual([
      text('Read '),
      {
        type: 'text',
        text: 'the link',
        marks: [{ type: 'link', attrs: { href: 'https://example.test/first' } }],
      },
      text(' and '),
      { type: 'footnote', content: [text('Note inside a list.')] },
      text(' with context.'),
    ]);
    expect(read.warnings).toEqual([
      warning('content-left-out', '<samp>', 2),
      warning('content-left-out', '<kbd>', 2),
      warning('content-left-out', 'HTML block', 1),
    ]);
    expect(() => readDocumentFile(read.file, createDocumentSchema())).not.toThrow();
  });

  it('DOCE-IMPORT-4.2 reports omitted inline and block HTML in source order', () => {
    const read = readMarkdown(
      [
        '> Before *<span>one</span>* and [a link][ref].',
        '> <div>omitted</div>',
        '',
        '| Heading |',
        '| ------- |',
        '| <kbd>two</kbd> <span>three</span> |',
        '',
        '<div>also omitted</div>',
        '',
        '[ref]: https://example.test',
      ].join('\n'),
    );
    expect(read.warnings).toEqual([
      warning('content-left-out', '<span>', 4),
      warning('content-left-out', 'HTML block', 2),
      warning('content-left-out', '<kbd>', 2),
    ]);
    expect(read.file.sections[0]?.content[0]?.content?.[0]?.content).toContainEqual({
      type: 'text',
      text: 'a link',
      marks: [{ type: 'link', attrs: { href: 'https://example.test' } }],
    });
  });

  it('DOCE-IMPORT-4.2 reports warnings where each used footnote is defined once', () => {
    const read = readMarkdown(
      [
        '[^early]: <small>Earlier definition</small>',
        '',
        '- First [^late] and <kbd>inline</kbd>.',
        '',
        '  <div>omitted</div>',
        '',
        'Late again [^late], early [^early].',
        '',
        '[^late]: <span>Later definition</span>',
        '',
        '[^unused]: Text <abbr>Unused definition</abbr>',
      ].join('\n'),
    );
    expect(read.warnings).toEqual([
      warning('content-left-out', '<small>', 2),
      warning('content-left-out', '<kbd>', 2),
      warning('content-left-out', 'HTML block', 1),
      warning('content-left-out', '<span>', 2),
    ]);
    const [list, last] = read.file.sections[0]?.content ?? [];
    const firstNote = list?.content?.[0]?.content?.[0]?.content?.[1];
    const repeatNote = last?.content?.[1];
    expect(firstNote).toEqual({ type: 'footnote', content: [text('Later definition')] });
    expect(repeatNote).toEqual(firstNote);
    expect(repeatNote?.content?.[0]).not.toBe(firstNote?.content?.[0]);
  });

  it('DOCE-IMPORT-4.2 DOCE-IMPORT-4.4 applies the nesting limit only to notes read by a citation', () => {
    const definition = `[^deep]:\n    ${'>'.repeat(40)} Deep definition`;
    expect(readMarkdown(definition).warnings).toEqual([]);
    const read = readMarkdown(`Cited[^deep] and cited again[^deep].\n\n${definition}`);
    expect(read.warnings).toEqual([warning('content-left-out', 'nesting', 1)]);
    const notes = read.file.sections[0]?.content[0]?.content?.filter(
      (node) => node.type === 'footnote',
    );
    expect(notes).toEqual(
      Array.from({ length: 2 }, () => ({
        type: 'footnote',
        content: [text('Deep definition')],
      })),
    );
  });

  // Reading the whole regression set, about 320,000 characters, three times, takes mdast a few
  // seconds on a busy runner: more than a test's default five.
  it(
    'DOCE-IMPORT-4.3 reads back what the writer writes for every regression document',
    { timeout: 30_000 },
    () => {
      const schema = createDocumentSchema();
      const files = readdirSync(documents).filter((name) => name.endsWith('.json'));
      expect(files.length).toBeGreaterThan(40);
      for (const name of files) {
        const file = JSON.parse(readFileSync(join(documents, name), 'utf8')) as DocumentFile;
        const written = writeMarkdown(file);
        const read = readMarkdown(written);
        const again = writeMarkdown(read.file);
        if (LOSSY[name]) expect(writeMarkdown(readMarkdown(again).file), name).toBe(again);
        else expect(trimmed(again), name).toBe(trimmed(written));
        expect(() => readDocumentFile(read.file, schema), name).not.toThrow();
      }
    },
  );
});
