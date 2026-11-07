import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import {
  LAYOUT_RULES,
  type LayoutBlock,
  layoutPages,
  type LayoutRules,
  stackedHeight,
} from '../index.js';

function block(name: string, height: number, extra: Partial<LayoutBlock> = {}): LayoutBlock {
  const attrs = name === 'heading' ? { level: Number(extra.measurement ?? 1) } : null;
  const type = documentSchema.nodes[name];
  const node = type?.isTextblock
    ? type.create(attrs, documentSchema.text(name))
    : type?.createAndFill(attrs);
  if (!node) throw new Error(name);
  return { node, height, marginTop: 0, marginBottom: 0, ...extra };
}

const paragraph = (height: number, extra: Partial<LayoutBlock> = {}) =>
  block('paragraph', height, extra);
const heading = (level: number, height = 20) => block('heading', height, { measurement: level });
const heights = (pages: LayoutBlock[][]) => pages.map((page) => page.map((entry) => entry.height));

// A paragraph split into a head that fills the height and a tail that starts the next page.
const splitting: LayoutRules = {
  ...LAYOUT_RULES,
  paragraph: {
    ...LAYOUT_RULES.paragraph,
    split: (entry, height) =>
      height < 10
        ? null
        : {
            head: { ...entry, height },
            tail: [{ ...entry, height: entry.height - height, breakBefore: true }],
          },
  },
};

describe('page layout', () => {
  it('DOCE-PAGINATION-2.1 fills each page in order with the blocks that fit', () => {
    const blocks = [100, 100, 100, 100].map((height) => paragraph(height));
    expect(heights(layoutPages(blocks, { pageHeight: 302 }))).toEqual([[100, 100, 100], [100]]);
    expect(heights(layoutPages(blocks, { pageHeight: 301 }))).toEqual([
      [100, 100],
      [100, 100],
    ]);
    expect(layoutPages([], { pageHeight: 300 })).toEqual([]);
  });

  it('DOCE-PAGINATION-2.2 collapses the margins between blocks and leaves out the outer ones', () => {
    const blocks = [
      paragraph(10, { marginTop: 50, marginBottom: 8 }),
      paragraph(10, { marginTop: 12, marginBottom: 50 }),
    ];
    expect(stackedHeight(blocks)).toBe(32);
    expect(heights(layoutPages(blocks, { pageHeight: 34 }))).toEqual([[10, 10]]);
  });

  it('DOCE-PAGINATION-2.3 splits a block that does not fit, and keeps an unsplittable one whole', () => {
    const pages = layoutPages([paragraph(50), paragraph(120)], {
      pageHeight: 102,
      rules: splitting,
    });
    expect(heights(pages)).toEqual([[50, 50], [70]]);
    const tall = layoutPages([paragraph(50), block('table', 500)], { pageHeight: 102 });
    expect(heights(tall)).toEqual([[50], [500]]);
  });

  it('DOCE-PAGINATION-2.4 ends a page after a page break and before a block that starts one', () => {
    const blocks = [
      paragraph(10),
      block('page_break', 0),
      paragraph(10),
      paragraph(10, { breakBefore: true }),
    ];
    expect(heights(layoutPages(blocks, { pageHeight: 500 }))).toEqual([[10, 0], [10], [10]]);
  });

  it('DOCE-PAGINATION-2.5 keeps a heading on the page of what it heads', () => {
    const blocks = [paragraph(60), heading(1), heading(2), block('table', 40)];
    expect(heights(layoutPages(blocks, { pageHeight: 102 }))).toEqual([[60], [20, 20, 40]]);
    const sibling = [paragraph(60), heading(2), heading(1), block('table', 40)];
    expect(heights(layoutPages(sibling, { pageHeight: 102 }))).toEqual([
      [60, 20],
      [20, 40],
    ]);
    const lead = [paragraph(60), heading(1), paragraph(100, { leadLineHeight: 10 })];
    expect(heights(layoutPages(lead, { pageHeight: 102, rules: splitting }))).toEqual([
      [60, 20, 20],
      [80],
    ]);
  });

  it('DOCE-PAGINATION-2.6 asks the page height for the blocks that would be on the page', () => {
    const noted = paragraph(40, { measurement: 'footnote' });
    const pageHeight = (blocks: readonly LayoutBlock[]) =>
      blocks.some((entry) => entry.measurement === 'footnote') ? 62 : 102;
    expect(heights(layoutPages([paragraph(40), noted, paragraph(40)], { pageHeight }))).toEqual([
      [40],
      [40],
      [40],
    ]);
  });
});
