import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import {
  LAYOUT_RULES,
  type LayoutBlock,
  layoutPages,
  type LayoutRules,
  stackedHeight,
  type TextMeasurement,
} from '../index.js';
import { createTableFigure } from '../schema/caption-content.js';

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
// Two words to a ten-pixel line.
const lines = (): TextMeasurement => ({
  offset: 0,
  measure: (from, to) => {
    const count = Math.max(1, Math.ceil((to - from) / 8));
    return { height: count * 10, lines: count };
  },
});
const row = (cell: string, text: string) =>
  documentSchema.node('table_row', null, [
    documentSchema.node(cell, null, [
      documentSchema.node('paragraph', null, [documentSchema.text(text)]),
    ]),
  ]);
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

  it('DOCE-PAGINATION-14.1 moves a block its rule sizes whole, never splitting it', () => {
    const sized: LayoutRules = {
      ...splitting,
      paragraph: { ...splitting.paragraph, size: () => ({ height: 120 }) },
    };
    const pages = layoutPages([paragraph(50), paragraph(120)], { pageHeight: 102, rules: sized });
    expect(heights(pages)).toEqual([[50], [120]]);
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
    const tall = layoutPages([paragraph(50), block('table_figure', 500)], { pageHeight: 102 });
    expect(heights(tall)).toEqual([[50], [500]]);
  });

  it('DOCE-PAGINATION-2.5 DOCE-PAGINATION-5.5 splits the block a heading keeps with once, testing and placing it', () => {
    let splits = 0;
    const counting: LayoutRules = {
      ...splitting,
      paragraph: {
        ...splitting.paragraph,
        split: (entry, height, context) => {
          splits += 1;
          return splitting.paragraph?.split?.(entry, height, context) ?? null;
        },
      },
    };
    const lead = [paragraph(60), heading(1), paragraph(100)];
    expect(heights(layoutPages(lead, { pageHeight: 102, rules: counting }))).toEqual([
      [60, 20, 20],
      [80],
    ]);
    expect(splits).toBe(1);
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
    const blocks = [paragraph(60), heading(1), heading(2), block('table_figure', 40)];
    expect(heights(layoutPages(blocks, { pageHeight: 102 }))).toEqual([[60], [20, 20, 40]]);
    const sibling = [paragraph(60), heading(2), heading(1), block('table_figure', 40)];
    expect(heights(layoutPages(sibling, { pageHeight: 102 }))).toEqual([
      [60, 20],
      [20, 40],
    ]);
    const lead = [paragraph(60), heading(1), paragraph(100)];
    expect(heights(layoutPages(lead, { pageHeight: 102, rules: splitting }))).toEqual([
      [60, 20, 20],
      [80],
    ]);
    expect(heights(layoutPages(lead, { pageHeight: 90, rules: splitting }))).toEqual([
      [60],
      [20, 68],
      [32],
    ]);
  });

  it('DOCE-PAGINATION-2.5 moves a heading with the block embed it heads', () => {
    const blocks = [paragraph(60), heading(1), block('embed', 40)];
    expect(heights(layoutPages(blocks, { pageHeight: 102 }))).toEqual([[60], [20, 40]]);
  });

  it('DOCE-PAGINATION-2.5 moves a heading with a three-line paragraph that cannot split under it', () => {
    const text = documentSchema.text('w00 w01 w02 w03 w04 w05');
    const short = {
      ...paragraph(30),
      node: documentSchema.node('paragraph', null, [text]),
      measurement: lines(),
    };
    expect(heights(layoutPages([paragraph(60), heading(1), short], { pageHeight: 102 }))).toEqual([
      [60],
      [20, 30],
    ]);
    expect(heights(layoutPages([paragraph(50), heading(1), short], { pageHeight: 102 }))).toEqual([
      [50, 20, 30],
    ]);
  });

  it('DOCE-PAGINATION-2.5 keeps a heading with a captioned table when its caption, header and first row fit', () => {
    // The table with its caption, in the node holding both, as the document holds it.
    const rows = documentSchema.node('table', { captionEnabled: true }, [
      row('table_header', 'Room'),
      row('table_cell', 'One'),
      row('table_cell', 'Two'),
      row('table_cell', 'Three'),
    ]);
    const table = createTableFigure(documentSchema, rows, 'Readings');
    if (!table) throw new Error('No table');
    const layouts = Array.from({ length: 4 }, (_, index) => ({
      top: index * 20,
      bottom: (index + 1) * 20,
    }));
    const captioned = {
      ...block('table_figure', 95),
      node: table,
      measurement: { children: layouts },
    };
    expect(
      heights(layoutPages([paragraph(123), heading(1), captioned], { pageHeight: 200 })),
    ).toEqual([[123, 20, 55], [75]]);
    expect(
      heights(layoutPages([paragraph(128), heading(1), captioned], { pageHeight: 200 })),
    ).toEqual([[128], [20, 95]]);
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

  describe('DOCE-PAGINATION-2.7 a split sized by the footnotes its head holds', () => {
    // A paragraph whose footnote markers sit at heights in it, split at whole ten-pixel lines; a
    // page of 200 leaves room for the entries of the markers it holds.
    interface Note {
      readonly at: number;
      readonly height: number;
    }
    // A heading's measurement is its level, so only a list is a paragraph's notes.
    const notesOf = (entry: LayoutBlock): readonly Note[] =>
      Array.isArray(entry.measurement) ? (entry.measurement as Note[]) : [];
    const noted: LayoutRules = {
      ...LAYOUT_RULES,
      paragraph: {
        ...LAYOUT_RULES.paragraph,
        split: (entry, height) => {
          const cut = Math.floor(height / 10) * 10;
          if (cut < 10 || cut >= entry.height) return null;
          const notes = notesOf(entry);
          const tail = notes.filter((note) => note.at >= cut);
          return {
            head: { ...entry, height: cut, measurement: notes.filter((note) => note.at < cut) },
            tail: [
              {
                ...entry,
                height: entry.height - cut,
                breakBefore: true,
                measurement: tail.map((note) => ({ ...note, at: note.at - cut })),
              },
            ],
          };
        },
      },
    };
    const pageHeight = (blocks: readonly LayoutBlock[]) =>
      200 - blocks.flatMap(notesOf).reduce((sum, note) => sum + note.height, 0);
    const pagesOf = (height: number, notes: Note[]) =>
      layoutPages([paragraph(height, { measurement: notes })], { pageHeight, rules: noted }).map(
        (page) => page.map((entry) => [entry.height, notesOf(entry).length]),
      );

    it('leaves no room on a page for a footnote its tail holds', () => {
      expect(pagesOf(300, [{ at: 290, height: 50 }])).toEqual([[[190, 0]], [[110, 1]]]);
    });

    it('leaves the room on the page that holds the marker', () => {
      expect(pagesOf(300, [{ at: 100, height: 50 }])).toEqual([[[140, 1]], [[160, 0]]]);
    });

    it('fills the page up to the line before a marker whose entry does not fit with it', () => {
      expect(pagesOf(300, [{ at: 170, height: 50 }])).toEqual([[[170, 0]], [[130, 1]]]);
    });

    it('takes off the entries of the markers the head holds, each with its own height', () => {
      expect(
        pagesOf(400, [
          { at: 20, height: 30 },
          { at: 150, height: 60 },
          { at: 380, height: 10 },
        ]),
      ).toEqual([[[150, 1]], [[130, 1]], [[120, 1]]]);
    });

    it('looks above a height the split refuses for a shorter head that leaves out a marker', () => {
      // Two lines on each side, as a paragraph keeps: a three-line head holds the first marker
      // and leaves itself too little room, the room that marker leaves is under two lines, and
      // the two-line head between them is the one that fits, so the heading keeps with it.
      const twoLines: LayoutRules = {
        ...noted,
        paragraph: {
          ...noted.paragraph,
          split: (entry, height, context) =>
            Math.floor(height / 10) < 2 || entry.height - Math.floor(height / 10) * 10 < 20
              ? null
              : (noted.paragraph?.split?.(entry, height, context) ?? null),
        },
      };
      const notes = [
        { at: 20, height: 18 },
        { at: 70, height: 18 },
      ];
      const pages = layoutPages(
        [paragraph(10), heading(2, 10), paragraph(80, { measurement: notes })],
        {
          pageHeight: (blocks) =>
            52 - blocks.flatMap(notesOf).reduce((sum, note) => sum + note.height, 0),
          rules: twoLines,
        },
      );
      expect(pages.map((page) => page.map((entry) => entry.height))).toEqual([
        [10, 10, 20],
        [30],
        [30],
      ]);
    });
  });
});
