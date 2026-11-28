import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { node } from '../../test/pages-fixtures.js';
import { lineMarks } from '../layout-engine/line-marks.js';
import type { LineTable, TextLine } from '../layout-engine/line-table.js';
import {
  codeElements,
  codeTrees,
  firstCodeLine,
  gutterText,
  gutterTree,
  wrapsOfMarks,
} from './code-drawing.js';
import { drawGutter } from './code-gutter.js';

// Lines over the given ranges of a code text, each ending at the next one's start.
function tableOf(ranges: readonly (readonly [number, number])[]): LineTable {
  const lines = ranges.map(([from, to], index): TextLine => {
    const end = index === ranges.length - 1 ? 'end' : 'wrap';
    return { from, to, width: 10, left: 0, top: index * 20, height: 20, end };
  });
  return { width: 100, lines, height: lines.length * 20, overhead: 0, inset: 24 };
}

const html = (trees: Parameters<typeof codeElements>[1]) => {
  const holder = document.createElement('div');
  holder.append(...codeElements(document, trees));
  return holder;
};

const CODE = 'const value = 1;\nreturn value;';
// The first line wraps after `const `, the second after `return`.
const TABLE = tableOf([
  [0, 6],
  [6, 17],
  [17, 23],
  [23, 30],
]);

describe('code drawing', () => {
  it('DOCE-PAGINATION-11.2 draws code as its tokens inside its line marks, a token across a line end split at it', () => {
    const block = node('code_block', { language: 'typescript' }, [documentSchema.text(CODE)]);
    const marks = lineMarks(block, { ...TABLE, justify: false });
    const drawn = html(codeTrees(CODE, 'typescript', marks));
    expect(drawn).toHaveTextContent(CODE, { normalizeWhitespace: false });
    const ends = [...drawn.querySelectorAll('.de-forced-lines__end')];
    // A line that ends at a line feed is broken by it, so only the wrapped ones end in a mark.
    expect(ends.map((end) => end.textContent?.at(-1))).toEqual([' ', 'n']);
    // `return` ends its line at its last character: its token is split, that part in the end mark.
    expect(ends[1]?.innerHTML).toBe('<span class="de-code-token" data-token="keyword">n</span>');
    expect(ends[1]?.previousSibling?.textContent).toBe('retur');
    expect(drawn.querySelectorAll('.de-code-token').length).toBeGreaterThan(3);
    // Without marks, the tokens alone, as the browser's lines draw them.
    expect(html(codeTrees(CODE, 'typescript')).querySelector('.de-forced-lines__end')).toBeNull();
  });

  it('DOCE-PAGINATION-11.2 draws long highlighted code without rescanning every line mark for each token', () => {
    const length = 256;
    const line = 'const x = 1;\n';
    let reads = 0;
    const marks = Array.from({ length }, (_, index) => ({
      get from() {
        reads += 1;
        return index * line.length + 4;
      },
      to: index * line.length + 5,
      class: 'de-forced-lines__end',
    }));
    const code = line.repeat(length);
    const drawn = html(codeTrees(code, 'typescript', marks));
    expect(drawn).toHaveTextContent(code, { normalizeWhitespace: false });
    const ends = [...drawn.querySelectorAll('.de-forced-lines__end [data-token="keyword"]')];
    expect(ends.map((end) => end.textContent)).toEqual(Array.from({ length }, () => 't'));
    expect(reads).toBeLessThan(length * 20);
  });

  it('DOCE-PAGINATION-11.2 draws a gutter from line marks as the editor draws it from its lines', () => {
    const block = node('code_block', { codeLineStart: 99 }, [documentSchema.text(CODE)]);
    const marks = lineMarks(block, { ...TABLE, justify: false });
    const first = firstCodeLine(block);
    const printed = html([gutterTree(gutterText(block), { first, wraps: wrapsOfMarks(marks) })]);
    const gutter = document.createElement('span');
    document.createElement('pre').append(gutter);
    drawGutter(gutter, gutterText(block), { first, lines: TABLE });
    expect(printed.firstElementChild?.innerHTML).toBe(gutter.innerHTML);
    expect(gutter.parentElement?.style.getPropertyValue('--de-code-gutter-digits')).toBe('3');
    const numbers = [...printed.querySelectorAll('.de-code-gutter__number')];
    expect(numbers.map((each) => each.textContent)).toEqual(['99', '100']);
    // Each line's copy breaks where its line wraps.
    expect(printed.querySelectorAll('.de-code-gutter__text br')).toHaveLength(2);
    expect(printed.querySelector('[data-engine-lines="true"]')).not.toBeNull();
  });

  it('DOCE-PAGINATION-11.2 numbers linked code from its start line, its last line feed starting no line', () => {
    const linked = node('linked_code_block', { code: 'a\nb\n', startLine: 7 });
    expect(firstCodeLine(linked)).toBe(7);
    expect(gutterText(linked)).toBe('a\nb');
    const block = node('code_block', { codeLineStart: 0 }, [documentSchema.text('a\n')]);
    expect(firstCodeLine(block)).toBe(1);
    expect(gutterText(block)).toBe('a\n');
  });
});
