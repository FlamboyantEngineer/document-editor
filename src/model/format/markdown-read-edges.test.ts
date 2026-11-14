// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoredNode } from './document-format.js';
import { readMarkdown } from './markdown-read.js';

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
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('DOCE-IMPORT-4.4 keeps a definition-shaped line inside a longer fence as code', () => {
    const code = ['```', '[foo]: bar', '```'].join('\n');
    expect(blocksOf(['````md', code, '````', '', '[foo]'].join('\n'))).toEqual([
      { type: 'codeBlock', attrs: { language: 'md' }, content: [text(code)] },
      paragraph(text('[foo]')),
    ]);
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

  it('DOCE-IMPORT-4.4 reads unclosed emphasis in work that grows with the text, not its square', () => {
    const scans = (count: number) => {
      const startsWith = vi.spyOn(String.prototype, 'startsWith');
      const [read] = blocksOf('*a '.repeat(count));
      const calls = startsWith.mock.calls.length;
      startsWith.mockRestore();
      expect(read?.content).toEqual([text('*a '.repeat(count).trim())]);
      return calls;
    };
    // Four times the text: about four times the scans, where rescanning to the end gave sixteen.
    expect(scans(1000)).toBeLessThan(scans(250) * 6);
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
