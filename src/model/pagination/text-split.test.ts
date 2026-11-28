import type { Node } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import {
  joinFragments,
  type LayoutBlock,
  layoutPages,
  planCodeSplit,
  planParagraphSplit,
  splitCode,
  splitParagraph,
  type TextMeasurement,
} from '../index.js';

// Text laid out eight characters to a line, ten pixels a line: two of the words below per line.
const LINE = 10;
const lineMeasurement = (text: string, offset = 0): TextMeasurement => ({
  offset,
  measure: (from, to) => {
    const lines = Math.max(1, Math.ceil((to - from) / 8));
    return { height: lines * LINE, lines };
  },
});
// Code: one rendered line per source line.
const codeMeasurement = (text: string, overhead = 0): TextMeasurement => ({
  offset: 0,
  overhead,
  measure: (from, to) => {
    const lines = text.slice(from, to).split('\n').length;
    return { height: lines * LINE, lines };
  },
});

const words = (count: number) =>
  Array.from({ length: count }, (_, index) => `w${String(index).padStart(2, '0')}`).join(' ');

function paragraphBlock(text: string): LayoutBlock {
  const node = documentSchema.node('paragraph', { dataId: 'p1' }, [documentSchema.text(text)]);
  const lines = Math.ceil(text.length / 8);
  return {
    node,
    height: lines * LINE,
    marginTop: 0,
    marginBottom: 0,
    measurement: lineMeasurement(text),
  };
}

function codeBlock(text: string): LayoutBlock {
  const node = documentSchema.node('code_block', { dataId: 'c1' }, [documentSchema.text(text)]);
  const height = text.split('\n').length * LINE + 6;
  return { node, height, marginTop: 0, marginBottom: 0, measurement: codeMeasurement(text, 6) };
}

const texts = (nodes: (Node | undefined)[]) => nodes.map((node) => node?.textContent);

describe('text splits', () => {
  it('DOCE-PAGINATION-3.1 splits a paragraph after the last word that fits', () => {
    const block = paragraphBlock(words(10));
    const split = splitParagraph(block, 32);
    expect(texts([split?.head.node, split?.tail[0]?.node])).toEqual([
      `${words(6)} `,
      'w06 w07 w08 w09',
    ]);
    expect(split?.head.height).toBe(30);
    expect(split?.tail[0]).toMatchObject({
      height: 20,
      breakBefore: true,
      measurement: { offset: 24 },
    });
    expect(split?.tail[0]?.node.attrs.splitPartIndex).toBe(1);
  });

  it('DOCE-PAGINATION-3.6 moves a hard break ending the first fragment to the second', () => {
    const schema = documentSchema;
    const br = () => schema.node('hard_break');
    // Each text and break is a line of its own: a, b, c and d.
    const node = schema.node('paragraph', { dataId: 'p1' }, [
      schema.text('aaaaaaaa'),
      br(),
      schema.text('bbbbbbbb'),
      br(),
      schema.text('cccccccc'),
      br(),
      schema.text('dddddddd'),
    ]);
    const lines = [0, 9, 18, 27].map((from) => ({ from, height: LINE }));
    const block: LayoutBlock = {
      node,
      height: 4 * LINE,
      marginTop: 0,
      marginBottom: 0,
      measurement: { ...lineMeasurement(''), lines: { lines } },
    };
    const split = splitParagraph(block, 25);
    const head = split?.head.node;
    const tail = split?.tail[0]?.node;
    expect(head?.lastChild?.type.name).toBe('text');
    expect(tail?.firstChild?.type.name).toBe('hard_break');
    expect(head && tail && head.content.append(tail.content).eq(node.content)).toBe(true);
    expect(split?.tail[0]?.measurement).toMatchObject({ offset: 17 });
  });

  it('DOCE-PAGINATION-3.6 starts no line of a later fragment with the break moved there', () => {
    const schema = documentSchema;
    const br = () => schema.node('hard_break');
    // Two breaks after each text: a, an empty line, b, an empty line, c, an empty line and d.
    const node = schema.node('paragraph', { dataId: 'p1' }, [
      ...['aaaaaaaa', 'bbbbbbbb', 'cccccccc'].flatMap((text) => [schema.text(text), br(), br()]),
      schema.text('dddddddd'),
    ]);
    const lines = [0, 9, 10, 19, 20, 29, 30].map((from) => ({ from, height: LINE }));
    const block: LayoutBlock = {
      node,
      height: 7 * LINE,
      marginTop: 0,
      marginBottom: 0,
      measurement: { ...lineMeasurement(''), lines: { lines } },
    };
    // a and the empty line after it; the break before b moves to the second fragment.
    const first = splitParagraph(block, 25);
    expect(first?.head.height).toBe(20);
    const tail = first?.tail[0];
    expect(tail?.measurement).toMatchObject({ offset: 9 });
    expect(tail?.height).toBe(50);
    // The moved break draws no line, so the second fragment's first two lines are b and the
    // empty line after it, not the empty line the first fragment draws.
    const second = tail && splitParagraph(tail, 25);
    expect(second?.head.node.textContent).toBe('bbbbbbbb');
    expect(second?.head.node.lastChild?.type.name).toBe('hard_break');
    expect([second?.head.height, second?.tail[0]?.height]).toEqual([20, 30]);
    expect(second?.tail[0]?.measurement).toMatchObject({ offset: 19 });
  });

  it('DOCE-PAGINATION-3.6 keeps the empty line after a last hard break in the last fragment', () => {
    const schema = documentSchema;
    // a, b, c and d, then the empty line the last break ends with.
    const node = schema.node('paragraph', { dataId: 'p1' }, [
      ...['aaaaaaaa', 'bbbbbbbb', 'cccccccc', 'dddddddd'].flatMap((text) => [
        schema.text(text),
        schema.node('hard_break'),
      ]),
    ]);
    const lines = [0, 9, 18, 27, 36].map((from) => ({ from, height: LINE }));
    const block: LayoutBlock = {
      node,
      height: 5 * LINE,
      marginTop: 0,
      marginBottom: 0,
      measurement: { ...lineMeasurement(''), lines: { lines } },
    };
    const split = splitParagraph(block, 25);
    expect([split?.head.height, split?.tail[0]?.height]).toEqual([20, 30]);
  });

  it('DOCE-PAGINATION-3.2 keeps at least two lines in each paragraph fragment', () => {
    const plan = (fitting: number, minimumTrailingLines?: number) =>
      planParagraphSplit({
        text: words(10),
        height: 50,
        fitting,
        measurement: lineMeasurement(words(10)),
        minimumTrailingLines,
      });
    expect(plan(42)).toMatchObject({ end: 24, headHeight: 30 });
    expect(plan(32, 3)).toMatchObject({ end: 16, headHeight: 20 });
    expect(plan(12)).toBeNull();
    expect(plan(60)).toBeNull();
  });

  it('DOCE-PAGINATION-3.3 splits code at a line break, numbering the second fragment on', () => {
    const block = codeBlock('one\ntwo\nthree\nfour');
    const split = splitCode(block, 30);
    expect(texts([split?.head.node, split?.tail[0]?.node])).toEqual(['one\ntwo', 'three\nfour']);
    expect([split?.head.height, split?.tail[0]?.height]).toEqual([26, 26]);
    expect(split?.tail[0]?.node.attrs).toMatchObject({
      codeBlockContinued: true,
      codeLineStart: 3,
    });
    const text = 'a\nb';
    expect(
      planCodeSplit({ text, height: 26, fitting: 10, measurement: codeMeasurement(text, 6) }),
    ).toBeNull();
    const endsWithBreak = 'a\n';
    expect(
      planCodeSplit({
        text: endsWithBreak,
        height: 20,
        fitting: 12,
        measurement: codeMeasurement(endsWithBreak),
      }),
    ).toBeNull();
  });

  it('DOCE-PAGINATION-3.3 reuses the original code breaks through successive fragments with a blank line', () => {
    const source = 'one\n\ntwo\nthree\nfour\nfive';
    const first = splitCode(codeBlock(source), 16);
    const next = first?.tail[0];
    const second = next && splitCode(next, 26);
    const last = second?.tail[0];
    const third = last && splitCode(last, 26);
    if (!first || !second || !third) throw new Error('code did not split');
    const parts = [first.head, second.head, third.head, ...third.tail];
    expect(parts.map((part) => part.node.textContent)).toEqual([
      'one',
      '\ntwo',
      'three\nfour',
      'five',
    ]);
    expect(parts.map((part) => part.node.attrs.codeLineStart)).toEqual([1, 2, 4, 6]);
    const [joined] = joinFragments(parts.map((part) => part.node));
    expect(joined?.textContent).toBe(source);
  });

  it('DOCE-PAGINATION-3.3 splits a code line longer than a page at a wrapped line on an empty page', () => {
    // One logical line wrapped eight characters to a ten-pixel line, then a short one.
    const text = `${'x'.repeat(64)}\nend`;
    const node = documentSchema.node('code_block', { dataId: 'c1', codeLineStart: 4 }, [
      documentSchema.text(text),
    ]);
    const wrapped = Array.from({ length: 8 }, (_, index) => ({ from: index * 8, height: LINE }));
    const table = [...wrapped, { from: 65, height: LINE }];
    const measurement: TextMeasurement = {
      offset: 0,
      overhead: 6,
      lines: { lines: table },
      measure: (from, to) => {
        const touched = table.filter(
          (line, index) => line.from < to && (table[index + 1]?.from ?? text.length) > from,
        );
        return { height: touched.length * LINE, lines: touched.length };
      },
    };
    const block = { node, height: 96, marginTop: 0, marginBottom: 0, measurement };
    const empty = { pageIndex: 0, pageHeight: 40, remainingHeight: 40, rules: {}, context: null };
    const split = splitCode(block, 38, empty);
    expect(texts([split?.head.node, split?.tail[0]?.node])).toEqual([
      'x'.repeat(24),
      `${'x'.repeat(40)}\nend`,
    ]);
    expect([split?.head.height, split?.tail[0]?.height]).toEqual([36, 66]);
    expect(split?.tail[0]?.node.attrs).toMatchObject({
      codeBlockContinued: true,
      codeLineContinued: true,
      codeLineStart: 4,
    });
    // On a page that holds blocks already, the code moves on to the next page whole.
    expect(splitCode(block, 38, { ...empty, remainingHeight: 30 })).toBeNull();
    // A later line feed that fits is still where it splits.
    const [joined] = joinFragments(
      layoutPages([block], { pageHeight: 40 })
        .flat()
        .map((entry) => entry.node),
    );
    expect(joined?.textContent).toBe(text);
  });

  it('DOCE-PAGINATION-3.4 splits linked code by its code', () => {
    const code = 'one\ntwo\nthree';
    const node = documentSchema.node('linked_code_block', { dataId: 'l1', code, startLine: 10 });
    const split = splitCode(
      { node, height: 30, marginTop: 0, marginBottom: 0, measurement: codeMeasurement(code) },
      20,
    );
    expect(split?.head.node.attrs.code).toBe('one\ntwo');
    expect(split?.tail[0]?.node.attrs).toMatchObject({
      code: 'three',
      startLine: 12,
      codeBlockContinued: true,
    });
  });

  it.each(['code_block', 'linked_code_block'])(
    'DOCE-PAGINATION-3.3 DOCE-PAGINATION-3.4 keeps the trailing line break in the last %s fragment',
    (type) => {
      const code = 'A\nB\n';
      const linked = type === 'linked_code_block';
      const node = linked
        ? documentSchema.node(type, { dataId: 'code', code, startLine: 10 })
        : documentSchema.node(type, { dataId: 'code' }, documentSchema.text(code));
      const block = {
        node,
        height: 30,
        marginTop: 0,
        marginBottom: 0,
        measurement: codeMeasurement(code),
      };
      const pages = layoutPages([block], { pageHeight: 22 });
      expect(pages.map((page) => page.map((part) => part.height))).toEqual([[10], [20]]);
      const parts = pages.flat().map((part) => part.node);
      expect(parts.map((part) => (linked ? part.attrs.code : part.textContent))).toEqual([
        'A',
        'B\n',
      ]);
      expect(parts[1]?.attrs[linked ? 'startLine' : 'codeLineStart']).toBe(linked ? 11 : 2);
      expect(joinFragments(parts)[0]?.eq(node)).toBe(true);
    },
  );

  it('DOCE-PAGINATION-3.5 lays a measured paragraph across pages and joins it back whole', () => {
    const block = paragraphBlock(words(16));
    const pages = layoutPages([block], { pageHeight: 32 });
    expect(pages.map((page) => page.map((entry) => entry.height))).toEqual([[30], [30], [20]]);
    const [joined] = joinFragments(pages.flat().map((entry) => entry.node));
    expect(joined?.textContent).toBe(words(16));
  });
  it('DOCE-PAGINATION-9.8 splits at a computed line start, keeping the lines asked for', () => {
    // Eight lines of eight characters, two words each, the third 15px tall.
    const text = words(16);
    const lines = Array.from({ length: 8 }, (_, index) => ({
      from: index * 8,
      height: index === 2 ? 15 : LINE,
    }));
    const measurement = { ...lineMeasurement(text), lines: { lines } };
    const input = { text, height: 85, fitting: 36, measurement };
    expect(planParagraphSplit(input)).toEqual({
      end: 24,
      next: 24,
      headHeight: 35,
      tailHeight: 50,
    });
    expect(planParagraphSplit({ ...input, minimumTrailingLines: 6 })).toEqual({
      end: 16,
      next: 16,
      headHeight: 20,
      tailHeight: 65,
    });
    expect(planParagraphSplit({ ...input, fitting: 15 })).toBeNull();
    const tail = {
      ...input,
      text: text.slice(48),
      height: 20,
      measurement: { ...measurement, offset: 48 },
    };
    expect(planParagraphSplit({ ...tail, fitting: 100 })).toBeNull();
  });

  it('DOCE-PAGINATION-11.11 backs up to a split that keeps lines with the same content offset together', () => {
    const text = words(12);
    const lines = [0, 8, 16, 24, 24, 32, 40].map((from) => ({ from, height: LINE }));
    const plan = planParagraphSplit({
      text,
      height: 70,
      fitting: 45,
      measurement: { ...lineMeasurement(text), lines: { lines } },
    });
    expect(plan).toEqual({ next: 16, end: 16, headHeight: 20, tailHeight: 50 });
  });

  it('DOCE-PAGINATION-11.11 backs up from a line that starts inside a widget', () => {
    const text = words(12);
    const lines = [0, 8, 16, 24, 32, 40].map((from) => ({
      from,
      height: LINE,
      ...(from === 24 ? { inWord: true as const } : {}),
    }));
    expect(
      planParagraphSplit({
        text,
        height: 6 * LINE,
        fitting: 35,
        measurement: { ...lineMeasurement(text), lines: { lines } },
      }),
    ).toEqual({ next: 16, end: 16, headHeight: 20, tailHeight: 40 });
  });

  it('DOCE-PAGINATION-9.8 splits only the fitting lines of a long paragraph across repeated fragments', () => {
    const count = 4_096;
    let reads = 0;
    const lines = Array.from({ length: count }, (_, index) => ({
      get from() {
        reads += 1;
        return index * 8;
      },
      get height() {
        reads += 1;
        return LINE;
      },
    }));
    const text = 'x'.repeat(count * 8);
    const measurement = { ...lineMeasurement(text), lines: { lines } };
    const plan = (offset: number) =>
      planParagraphSplit({
        text: text.slice(offset),
        height: (count - offset / 8) * LINE,
        fitting: 25,
        measurement: { ...measurement, offset },
      });
    expect(plan(0)?.next).toBe(16);
    reads = 0;
    for (let page = 1; page <= 64; page += 1) {
      expect(plan(page * 16)).toMatchObject({ end: 16, next: 16, headHeight: 20 });
    }
    expect(reads).toBeLessThan(3_000);
  });

  it('DOCE-PAGINATION-9.8 keeps an exact fit after a fragment with a much taller line', () => {
    const text = 'x'.repeat(32);
    const lines = [0, 8, 16, 24, 32].map((from) => ({ from, height: from ? 10.1 : 1e12 }));
    const plan = planParagraphSplit({
      text,
      height: 40.4,
      fitting: 20.2,
      measurement: { ...lineMeasurement(text, 8), lines: { lines } },
    });
    expect(plan).toEqual({ end: 16, next: 16, headHeight: 20.2, tailHeight: 20.2 });
  });
});
