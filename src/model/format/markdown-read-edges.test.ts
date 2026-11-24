// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { StoredNode } from './document-format.js';
import { readMarkdown } from './markdown-read.js';
import { MAX_MARKDOWN_DEPTH } from './markdown-read-depth.js';

const blocksOf = (markdown: string) => readMarkdown(markdown).file.sections[0]?.content ?? [];
const text = (value: string, ...marks: string[]): StoredNode => ({
  type: 'text',
  text: value,
  ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}),
});
const paragraph = (...content: StoredNode[]): StoredNode => ({ type: 'paragraph', content });
const linked = (value: string, href: string): StoredNode => ({
  type: 'text',
  text: value,
  marks: [{ type: 'link', attrs: { href } }],
});

describe('reading Markdown edge cases', () => {
  it('DOCE-IMPORT-4.4 keeps a definition-shaped line inside a longer fence as code', () => {
    const code = ['```', '[foo]: bar', '```'].join('\n');
    expect(blocksOf(['````md', code, '````', '', '[foo]'].join('\n'))).toEqual([
      { type: 'codeBlock', attrs: { language: 'md' }, content: [text(code)] },
      paragraph(text('[foo]')),
    ]);
  });

  it('DOCE-IMPORT-4.4 reads every cell of a wide table', () => {
    const width = 120;
    const row = (cell: string) => Array.from({ length: width }, () => cell).join(' | ');
    const source = [row('Heading'), row('---'), ...Array.from({ length: 6 }, () => row('Probe'))];
    const [table] = blocksOf(source.join('\n'));
    expect(table?.content).toHaveLength(8);
    expect(table?.content?.[7]?.content).toHaveLength(width);
  });

  it('DOCE-IMPORT-4.4 reads a line starting with a code span of three backticks as a paragraph', () => {
    expect(blocksOf('```code``` then text\n\nNext')).toEqual([
      paragraph(text('code', 'code'), text(' then text')),
      paragraph(text('Next')),
    ]);
  });

  it('DOCE-IMPORT-4.4 reads a dollar amount as text, not as math', () => {
    expect(blocksOf('Tickets cost $5-$10 each.')).toEqual([
      paragraph(text('Tickets cost $5-$10 each.')),
    ]);
    expect(blocksOf('From US$5 to US$10')).toEqual([paragraph(text('From US$5 to US$10'))]);
    expect(blocksOf('Cost $x$ and $a\\$b$.')).toEqual([
      paragraph(
        text('Cost '),
        { type: 'math', attrs: { source: 'x' } },
        text(' and '),
        { type: 'math', attrs: { source: 'a\\$b' } },
        text('.'),
      ),
    ]);
  });

  it('DOCE-IMPORT-4.4 reads nested emphasis, character references and lazy quote lines as CommonMark does', () => {
    expect(blocksOf('*a **b** c*')).toEqual([
      paragraph(
        text('a ', 'italic'),
        { type: 'text', text: 'b', marks: [{ type: 'italic' }, { type: 'bold' }] },
        text(' c', 'italic'),
      ),
    ]);
    expect(blocksOf('Caf&eacute; &amp; &#35;')).toEqual([paragraph(text('Café & #'))]);
    expect(blocksOf('> quote\ncontinued')).toEqual([
      { type: 'blockquote', content: [paragraph(text('quote continued'))] },
    ]);
  });

  it("DOCE-IMPORT-4.4 keeps a footnote's later paragraphs in it and an escaped variable as text", () => {
    expect(blocksOf('Text[^n].\n\n[^n]: First.\n\n    Second.')).toEqual([
      paragraph(text('Text'), { type: 'footnote', content: [text('First. Second.')] }, text('.')),
    ]);
    expect(blocksOf('\\{{key}} and {{key}}')).toEqual([
      paragraph(text('{{key}} and '), { type: 'variable', attrs: { key: 'key' } }),
    ]);
  });

  it('DOCE-IMPORT-4.4 keeps a task list box in a numbered item as text', () => {
    expect(blocksOf('1. [x] Done')).toEqual([
      {
        type: 'orderedList',
        content: [{ type: 'listItem', content: [paragraph(text('[x] Done'))] }],
      },
    ]);
  });

  it('DOCE-IMPORT-4.4 reads $$ display math fenced, on one line, in a quote and inline', () => {
    const block = (source: string): StoredNode => ({ type: 'mathBlock', attrs: { source } });
    expect(blocksOf('$$\nx^2\n$$\n\n$$y$$')).toEqual([block('x^2'), block('y')]);
    expect(blocksOf('> $$\n> a\n> $$')).toEqual([{ type: 'blockquote', content: [block('a')] }]);
    expect(blocksOf('a $$x$$ b')).toEqual([
      paragraph(text('a '), { type: 'math', attrs: { source: 'x' } }, text(' b')),
    ]);
    const labelled = readMarkdown('$$ label\nz\n$$');
    expect(labelled.file.sections[0]?.content).toEqual([block('z')]);
    expect(labelled.warnings.map((warning) => warning.detail)).toEqual(['math label']);
  });

  it('DOCE-IMPORT-4.4 reads a link address holding balanced or escaped parentheses', () => {
    expect(blocksOf('[x](a(1)) [y](b\\(2) [z](<c d>)')).toEqual([
      paragraph(linked('x', 'a(1)'), text(' '), linked('y', 'b(2'), text(' '), linked('z', 'c d')),
    ]);
    expect(blocksOf('[x](a(1) rest')).toEqual([paragraph(text('[x](a(1) rest'))]);
  });

  it('DOCE-IMPORT-4.4 reads a tag named after an object property as one it does not know', () => {
    const read = readMarkdown('<constructor>a</constructor> <toString>b</toString>');
    expect(read.file.sections[0]?.content).toEqual([paragraph(text('a b'))]);
    expect(read.warnings.map((warning) => warning.detail)).toEqual(['<constructor>', '<tostring>']);
  });

  it('DOCE-IMPORT-4.4 reads unclosed emphasis, links, math, tags and variables, emphasis runs and wide tables in time that grows with the text', () => {
    // The fastest of three reads, so a pause elsewhere does not count.
    const time = (markdown: string) => {
      let best = Infinity;
      for (let run = 0; run < 3; run += 1) {
        const start = performance.now();
        readMarkdown(markdown);
        best = Math.min(best, performance.now() - start);
      }
      return best;
    };
    const wideTable = (columns: number) =>
      ['| a '.repeat(columns), '|---'.repeat(columns), '| 1 '.repeat(columns)].join('|\n') + '|';
    expect(time(wideTable(8000)), 'wide table').toBeLessThan(time(wideTable(2000)) * 9 + 5);
    for (const unit of ['*a ', '**a*', '[a](', '$a ', '<u>a ', '{{a}} {{']) {
      expect(blocksOf(unit.repeat(10))).toHaveLength(1);
      // Four times the text: about four times the time, where rescanning to the end gave sixteen.
      expect(time(unit.repeat(8000)), unit).toBeLessThan(time(unit.repeat(2000)) * 9 + 5);
    }
  });

  it('DOCE-IMPORT-4.4 flattens nesting deeper than a document holds, with a warning', () => {
    const read = readMarkdown(`${'>'.repeat(5000)} deep`);
    let depth = 0;
    for (
      let node = read.file.sections[0]?.content[0];
      node?.type === 'blockquote';
      node = node.content?.[0]
    )
      depth += 1;
    expect(depth).toBe(MAX_MARKDOWN_DEPTH);
    expect(read.warnings.map((warning) => [warning.code, warning.detail])).toEqual([
      ['content-left-out', 'nesting'],
    ]);
  });

  it('DOCE-IMPORT-4.4 reads unclosed tags without lower-casing the whole text for each', () => {
    const lower = vi.spyOn(String.prototype, 'toLowerCase');
    const [read] = blocksOf('<u>a '.repeat(2000));
    const whole = lower.mock.contexts.filter((value) => String(value).length > 1000).length;
    lower.mockRestore();
    expect(read?.content).toEqual([text('a '.repeat(2000).trim())]);
    expect(whole).toBeLessThanOrEqual(1);
  });
});
