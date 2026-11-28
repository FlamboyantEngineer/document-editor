// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import {
  emptyLineIndent,
  firstLineIndent,
  type JustifiedLines,
  labelParts,
  lineMarks,
} from './line-marks.js';
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

  it('DOCE-PAGINATION-11.12 ends and starts lines at shown text, past the hidden ranges', () => {
    // `aaa` then a hidden `xxxx` ends the first line; the second starts with a hidden `yy`.
    const node = paragraph('aaaxxxxyybbbb');
    const lines = table(13, 7).lines.map((line) => ({ ...line, left: 5 }));
    const hidden = [
      [3, 7],
      [7, 9],
    ] as const;
    const marks = lineMarks(node, { ...table(13, 7), lines, hidden, justify: true });
    expect(marks).toEqual([
      { from: 0, to: 1, class: 'de-forced-lines__start', style: '--de-line-indent: 5.000px' },
      { from: 2, to: 3, class: 'de-forced-lines__end' },
      { from: 9, to: 10, class: 'de-forced-lines__start', style: '--de-line-indent: 5.000px' },
    ]);
  });

  it('DOCE-PAGINATION-11.12 counts only the shown spaces of a justified line', () => {
    // The hidden range holds two spaces of the line's five; the shown three take its free room.
    const node = paragraph('a b x y c d');
    const lines = table(11, 11, { justify: true }).lines.map((line) => ({
      ...line,
      end: 'wrap' as const,
    }));
    const marks = lineMarks(node, { ...table(11, 11), lines, hidden: [[4, 8]], justify: true });
    expect(marks).toContainEqual({
      from: 0,
      to: 11,
      class: 'de-forced-lines__justified',
      style: '--de-word-spacing: 30.000px',
    });
  });

  it('DOCE-PAGINATION-11.11 breaks a line among inserted words with a mark of its own', () => {
    const node = paragraph('aaaaabbbbb');
    const [first, second] = table(10, 5).lines;
    if (!first || !second) throw new Error('two lines');
    // The second line starts among words inserted at 5, its break drawn at side -3 between them.
    const lines = [first, { ...second, left: 4, side: -3 }];
    expect(lineMarks(node, { ...table(10, 5), lines })).toEqual([
      {
        from: 5,
        to: 5,
        class: 'de-forced-lines__break',
        side: -3,
        style: '--de-line-indent: 4.000px',
      },
    ]);
    // After a hard break, the line only starts at its indent there.
    const broken = [
      { ...first, end: 'break' as const },
      { ...second, left: 4, side: -3 },
    ];
    expect(lineMarks(node, { ...table(10, 5), lines: broken })).toEqual([
      {
        from: 5,
        to: 5,
        class: 'de-forced-lines__indent',
        side: -3,
        style: '--de-line-indent: 4.000px',
      },
    ]);
  });

  it('DOCE-PAGINATION-13.1 ends and starts a line at the edges of math, never inside it', () => {
    const math = (latex: string) =>
      documentSchema.node('math_inline', null, [documentSchema.text(latex)]);
    // Inline math `a+b=c` takes offsets 0 to 7, then `xxx`; at 60px the math is a line of its own.
    const node = documentSchema.node('paragraph', null, [
      math('a+b=c'),
      documentSchema.text('xxx'),
    ]);
    const lines: TextLine[] = [
      { from: 0, to: 7, width: 40, left: 0, top: 0, height: 18, end: 'wrap' },
      { from: 7, to: 10, width: 20, left: 0, top: 18, height: 18, end: 'end' },
    ];
    const drawn: JustifiedLines = { width: 60, lines, height: 36, overhead: 0, justify: false };
    expect(lineMarks(node, drawn)).toEqual([{ from: 0, to: 7, class: 'de-forced-lines__end' }]);
    // A centred line starting with math indents the math whole.
    const after = documentSchema.node('paragraph', null, [
      documentSchema.text('xxx'),
      math('a+b=c'),
    ]);
    const centred: JustifiedLines = {
      ...drawn,
      lines: [
        { from: 0, to: 3, width: 20, left: 20, top: 0, height: 18, end: 'wrap' },
        { from: 3, to: 10, width: 40, left: 10, top: 18, height: 18, end: 'end' },
      ],
    };
    expect(lineMarks(after, centred)).toEqual([
      { from: 0, to: 1, class: 'de-forced-lines__start', style: '--de-line-indent: 20.000px' },
      { from: 2, to: 3, class: 'de-forced-lines__end' },
      { from: 3, to: 10, class: 'de-forced-lines__start', style: '--de-line-indent: 10.000px' },
    ]);
  });

  it('DOCE-PAGINATION-13.1 stretches spaces around an inline atom as a single box', () => {
    const math = documentSchema.node('math_inline', null, [documentSchema.text('x + y')]);
    const node = documentSchema.node('paragraph', null, [
      documentSchema.text('A '),
      math,
      documentSchema.text(' B Z'),
    ]);
    const to = 4 + math.nodeSize;
    const drawn = table(node.content.size, to, { justify: true });
    expect(lineMarks(node, drawn)).toEqual([
      { from: 0, to, class: 'de-forced-lines__justified', style: '--de-word-spacing: 45.000px' },
      { from: to - 1, to, class: 'de-forced-lines__end' },
    ]);
  });

  it('DOCE-PAGINATION-13.1 draws a wrap after an inline atom with a soft hyphen or line feed in its source', () => {
    for (const source of ['x\u00ad', 'x\n']) {
      const math = documentSchema.node('math_inline', null, [documentSchema.text(source)]);
      const node = documentSchema.node('paragraph', null, [
        documentSchema.text('A'),
        math,
        documentSchema.text('B'),
      ]);
      const to = 1 + math.nodeSize;
      expect(lineMarks(node, table(node.content.size, to))).toEqual([
        { from: 1, to, class: 'de-forced-lines__end' },
      ]);
    }
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

  it('DOCE-LABS-8.6 keeps clusters longer than any window whole at forced line starts and ends', () => {
    // A letter with 40 accents (41 units) and four people with skin tones (19 units), each starting
    // an indented line and ending a wrapped one.
    for (const cluster of [`q${'\u0301'.repeat(40)}`, '👨🏽‍👩🏾‍👧🏿‍👦🏻']) {
      const node = paragraph(`${cluster}a${cluster}`);
      const size = 2 * cluster.length + 1;
      const lines = table(size, cluster.length + 1).lines.map((line) => ({ ...line, left: 5 }));
      const marks = lineMarks(node, { ...table(size, cluster.length + 1), lines });
      const indent = '--de-line-indent: 5.000px';
      expect(marks).toEqual([
        { from: 0, to: cluster.length, class: 'de-forced-lines__start', style: indent },
        { from: cluster.length, to: cluster.length + 1, class: 'de-forced-lines__end' },
        { from: cluster.length + 1, to: size, class: 'de-forced-lines__start', style: indent },
      ]);
      // A wrapped line ending with the cluster ends at its start.
      const ends = lineMarks(paragraph(`a${cluster}b`), table(size, cluster.length + 1));
      expect(ends).toEqual([{ from: 1, to: cluster.length + 1, class: 'de-forced-lines__end' }]);
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

  it('DOCE-PAGINATION-12.4 reads each reserved box a bounded number of times across many lines', () => {
    const length = 256;
    let reads = 0;
    const reserved = Array.from({ length }, (_, from) => ({
      get from() {
        reads += 1;
        return from;
      },
      to: from + 1,
      width: 16,
    }));
    const marks = lineMarks(paragraph('☃'.repeat(length)), { ...table(length, 4), reserved });
    expect(marks.filter((mark) => mark.inner)).toHaveLength(length);
    expect(marks.filter((mark) => !mark.inner)).toHaveLength(length / 4 - 1);
    expect(reads).toBeLessThanOrEqual(length * 4);
  });

  it('DOCE-PAGINATION-13.1 indents aligned lines and stretches justified spaces over the room left after the indent', () => {
    const node = paragraph('aa bb cc dd');
    const lines = table(11, 6, { justify: true }).lines.map((line) => ({ ...line, left: 20 }));
    const marks = lineMarks(node, { ...table(11, 6), justify: true, lines });
    // A 10px line 20px in from the edge of 100px has 70px to fill.
    expect(marks).toEqual([
      { from: 0, to: 1, class: 'de-forced-lines__start', style: '--de-line-indent: 20.000px' },
      { from: 0, to: 5, class: 'de-forced-lines__justified', style: '--de-word-spacing: 70.000px' },
      { from: 5, to: 6, class: 'de-forced-lines__end' },
      { from: 6, to: 7, class: 'de-forced-lines__start', style: '--de-line-indent: 20.000px' },
    ]);
  });

  it('DOCE-PAGINATION-13.1 stretches no-break spaces with the spaces, as Chromium does', () => {
    // Two spaces and two no-break spaces share the 90px a 10px line leaves of 100px.
    const node = paragraph('a b\u00a0c d\u00a0e f');
    const marks = lineMarks(node, table(11, 9, { justify: true }));
    expect(marks[0]).toEqual({
      from: 0,
      to: 9,
      class: 'de-forced-lines__justified',
      style: '--de-word-spacing: 22.500px',
    });
  });

  it('DOCE-PAGINATION-13.1 draws the hyphen of a line that ends at a soft hyphen', () => {
    const node = paragraph('aaaa\u00adbbbb');
    expect(lineMarks(node, table(9, 5))).toEqual([
      { from: 4, to: 5, class: 'de-forced-lines__end de-forced-lines__hyphen' },
    ]);
  });

  it('DOCE-PAGINATION-11.11 leaves the break inside an inserted word to the browser', () => {
    // The first line ends inside a deleted word drawn at offset 5; the second starts inside it.
    const node = paragraph('aaaa bbbbb');
    const lines: TextLine[] = [
      { from: 0, to: 5, width: 10, left: 0, top: 0, height: 20, end: 'wrap' },
      { from: 5, to: 10, width: 10, left: 20, top: 20, height: 20, end: 'end', inWord: true },
    ];
    const drawn = { width: 100, lines, height: 40, overhead: 0, justify: false };
    expect(lineMarks(node, drawn)).toEqual([]);
  });

  it('DOCE-PAGINATION-11.2 indents the empty line after a hard break, where the caret is drawn', () => {
    const node = documentSchema.node('paragraph', null, [
      documentSchema.text('ab'),
      documentSchema.node('hard_break'),
    ]);
    const lines: TextLine[] = [
      { from: 0, to: 3, width: 10, left: 45, top: 0, height: 20, end: 'break' },
      { from: 3, to: 3, width: 0, left: 50, top: 20, height: 20, end: 'end' },
    ];
    const marks = lineMarks(node, { width: 100, lines, height: 40, overhead: 0, justify: false });
    expect(marks).toEqual([
      { from: 0, to: 1, class: 'de-forced-lines__start', style: '--de-line-indent: 45.000px' },
      {
        from: 3,
        to: 3,
        side: -1,
        class: 'de-forced-lines__indent',
        style: '--de-line-indent: 50.000px',
      },
    ]);
  });

  it('DOCE-PAGINATION-11.2 indents an empty aligned block as the block, where the caret is drawn', () => {
    const line: TextLine = { from: 0, to: 0, width: 0, left: 50, top: 0, height: 20, end: 'end' };
    const lines = [line];
    const empty = { width: 100, lines, height: 20, overhead: 0, justify: false };
    expect(lineMarks(paragraph(''), empty)).toEqual([]);
    expect(emptyLineIndent(empty)).toBe('--de-first-indent: 50.000px');
    expect(emptyLineIndent(table(3, 3, { lines: [{ ...line, to: 3 }] }))).toBeNull();
  });

  it('DOCE-PAGINATION-13.1 indents a prefixed block’s first line as the block, before its number', () => {
    const node = paragraph('aaaaabbbbb');
    const lines = table(10, 5).lines.map((line) => ({ ...line, left: 30 }));
    const centred = { ...table(10, 5), lines };
    expect(lineMarks(node, centred, { prefixed: true })).toEqual([
      { from: 4, to: 5, class: 'de-forced-lines__end' },
      { from: 5, to: 6, class: 'de-forced-lines__start', style: '--de-line-indent: 30.000px' },
    ]);
    expect(firstLineIndent(centred)).toBe('--de-first-indent: 30.000px');
    expect(firstLineIndent(table(10, 5))).toBeNull();
  });

  it('DOCE-PAGINATION-11.2 draws a code line from its gutter and leaves a line feed to the browser', () => {
    const code = documentSchema.node('code_block', null, [documentSchema.text('aaaa\nbbbbbbcc')]);
    // Lines of 5: `aaaa\n` ends at its line feed, `bbbbb` wraps, `bcc` ends the block; each line
    // starts 32px in, beside the gutter its box draws, 8px past its padding.
    const lines = table(13, 5, { overhead: 16, inset: 32 });
    const beside = { ...lines, lines: lines.lines.map((line) => ({ ...line, left: 40 })) };
    expect(lineMarks(code, beside)).toEqual([{ from: 9, to: 10, class: 'de-forced-lines__end' }]);
  });

  it('DOCE-PAGINATION-12.4 gives each part of a label the reserved clusters in it', () => {
    // `表 1 図 - ` breaks after its first part, with a box in each part: the boxes are by offset
    // in the label, the parts by offset in their own text.
    const labelled = table(2, 2, {
      label: '表 \n1 図 - ',
      prefixReserved: [
        { from: 0, to: 1, width: 12 },
        { from: 4, to: 5, width: 12 },
      ],
    });
    expect(labelParts(labelled)).toEqual([
      { text: '表 ', breaks: true, reserved: [{ from: 0, to: 1, width: 12 }] },
      { text: '1 図 - ', breaks: false, reserved: [{ from: 2, to: 3, width: 12 }] },
    ]);
    // Without a box, a label the content shares a line with is left to the stylesheet.
    expect(labelParts(table(2, 2))).toBeNull();
  });

  it('DOCE-PAGINATION-13.1 stretches only the spaces a justified line draws as text, none in math', () => {
    const math = documentSchema.node('math_inline', null, [documentSchema.text('a + b + c')]);
    const node = documentSchema.node('paragraph', null, [
      documentSchema.text('aa bb '),
      math,
      documentSchema.text(' cc dd ee'),
    ]);
    // The first line holds `aa bb `, the math and ` cc `: three spaces of text, four in the math's
    // source, which the view never draws as text.
    const end = 6 + math.nodeSize + 4;
    const lines = table(node.content.size, end, { justify: true }).lines;
    const marks = lineMarks(node, { ...table(0, 1), justify: true, lines });
    const justified = marks.find((mark) => mark.class === 'de-forced-lines__justified');
    expect(justified?.style).toBe(`--de-word-spacing: ${(90 / 3).toFixed(3)}px`);
  });
});
