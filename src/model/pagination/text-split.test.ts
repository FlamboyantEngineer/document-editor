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

  it('DOCE-PAGINATION-3.5 lays a measured paragraph across pages and joins it back whole', () => {
    const block = paragraphBlock(words(16));
    const pages = layoutPages([block], { pageHeight: 32 });
    expect(pages.map((page) => page.map((entry) => entry.height))).toEqual([[30], [30], [20]]);
    const [joined] = joinFragments(pages.flat().map((entry) => entry.node));
    expect(joined?.textContent).toBe(words(16));
  });
});
