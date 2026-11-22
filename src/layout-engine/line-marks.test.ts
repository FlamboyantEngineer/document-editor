// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { type JustifiedLines, lineMarks } from './line-marks.js';
import type { TextLine } from './line-table.js';

const paragraph = (text: string) =>
  documentSchema.node('paragraph', null, text ? [documentSchema.text(text)] : []);

// Lines of `perLine` characters, each 10px wide, starting `left` in from the content edge.
function table(size: number, perLine: number, options: Partial<JustifiedLines> = {}) {
  const lines: TextLine[] = [];
  for (let from = 0; from < size; from += perLine) {
    const to = Math.min(size, from + perLine);
    lines.push({
      from,
      to,
      width: 10,
      left: 0,
      top: 0,
      height: 20,
      end: to < size ? 'wrap' : 'end',
    });
  }
  const drawn: JustifiedLines = { width: 100, lines, height: 0, overhead: 0, justify: false };
  return { ...drawn, ...options };
}

describe('lineMarks', () => {
  it('DOCE-PAGINATION-13.1 ends each wrapped line at its last character, in content order', () => {
    const node = paragraph('aaaaabbbbbcc');
    expect(lineMarks(node, table(12, 5))).toEqual([
      { from: 4, to: 5, class: 'de-forced-lines__end' },
      { from: 9, to: 10, class: 'de-forced-lines__end' },
    ]);
  });

  it('DOCE-PAGINATION-13.1 keeps a character whole at a line end', () => {
    const node = paragraph('aaaa😀bb');
    const marks = lineMarks(node, table(8, 6));
    expect(marks).toEqual([{ from: 4, to: 6, class: 'de-forced-lines__end' }]);
  });

  it('DOCE-LABS-8.6 keeps a joined emoji, a flag and a letter with its marks whole at line edges', () => {
    // A family emoji (8 units), a flag (4) and e with two marks (3), each ending a line and the
    // next one starting with it.
    for (const cluster of ['👩‍👩‍👧', '🇨🇦', 'e\u0301\u0323']) {
      const node = paragraph(`aaa${cluster}${cluster}b`);
      const size = 3 + 2 * cluster.length + 1;
      const lines = table(size, 3 + cluster.length).lines.map((line) => ({ ...line, left: 5 }));
      const marks = lineMarks(node, { ...table(size, 3 + cluster.length), lines });
      const end = 3 + cluster.length;
      expect(marks).toEqual([
        { from: 0, to: 1, class: 'de-forced-lines__start', style: '--de-line-indent: 5.000px' },
        { from: 3, to: end, class: 'de-forced-lines__end' },
        {
          from: end,
          to: end + cluster.length,
          class: 'de-forced-lines__start',
          style: '--de-line-indent: 5.000px',
        },
      ]);
    }
  });

  it('DOCE-PAGINATION-12.4 draws a reserved cluster as an inner mark inside a line end', () => {
    const node = paragraph('aaaa☃bb');
    const marks = lineMarks(node, { ...table(7, 5), reserved: [{ from: 4, to: 5, width: 16 }] });
    expect(marks).toEqual([
      {
        from: 4,
        to: 5,
        class: 'de-forced-lines__reserved',
        style: '--de-reserved-width: 16.000px',
        inner: true,
      },
      { from: 4, to: 5, class: 'de-forced-lines__end' },
    ]);
  });

  it('DOCE-PAGINATION-12.4 cuts a justified line at a reserved box inside it', () => {
    const node = paragraph('aa ☃ bb cc');
    const marks = lineMarks(node, {
      ...table(10, 8),
      justify: true,
      reserved: [{ from: 3, to: 4, width: 16 }],
    });
    const word = '--de-word-spacing: 45.000px';
    expect(marks.map(({ from, to, class: name }) => [from, to, name])).toEqual([
      [0, 3, 'de-forced-lines__justified'],
      [3, 4, 'de-forced-lines__reserved'],
      [3, 4, 'de-forced-lines__justified'],
      [4, 7, 'de-forced-lines__justified'],
      [7, 8, 'de-forced-lines__end'],
    ]);
    expect(marks.filter((mark) => mark.class.endsWith('justified')).map((m) => m.style)).toEqual([
      word,
      word,
      word,
    ]);
  });

  it('DOCE-PAGINATION-13.1 indents aligned lines and stretches justified spaces', () => {
    const node = paragraph('aa bb cc dd');
    const lines = table(11, 6, { justify: true }).lines.map((line) => ({ ...line, left: 20 }));
    const marks = lineMarks(node, { ...table(11, 6), justify: true, lines });
    expect(marks).toEqual([
      { from: 0, to: 1, class: 'de-forced-lines__start', style: '--de-line-indent: 20.000px' },
      { from: 0, to: 5, class: 'de-forced-lines__justified', style: '--de-word-spacing: 90.000px' },
      { from: 5, to: 6, class: 'de-forced-lines__end' },
      { from: 6, to: 7, class: 'de-forced-lines__start', style: '--de-line-indent: 20.000px' },
    ]);
  });
});
