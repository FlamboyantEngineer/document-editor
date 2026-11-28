import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { type LayoutBlock, layoutNextPage, layoutPages } from '../model/index.js';
import { layoutSectionIncrementally, type SectionLayout } from './incremental-layout.js';

const PAGE_HEIGHT = 300;

function block(height: number, heading = false): LayoutBlock {
  const node = heading
    ? documentSchema.node('heading', { level: 2 }, documentSchema.text('Heading'))
    : documentSchema.node('paragraph', null, documentSchema.text(`Text ${height}`));
  return { node, height, marginTop: 10, marginBottom: 10 };
}

function layOut(blocks: readonly LayoutBlock[], previous?: SectionLayout) {
  return layoutSectionIncrementally({
    blocks,
    key: 'page',
    previous,
    state: () => '',
    next: (queue, index) => layoutNextPage(queue, index, { pageHeight: PAGE_HEIGHT }),
    page: () => undefined,
  });
}

const fresh = (blocks: readonly LayoutBlock[]) =>
  layoutPages(blocks, { pageHeight: PAGE_HEIGHT }).map((page) => page.map((b) => b.node));
const nodes = (pages: readonly (readonly LayoutBlock[])[]) =>
  pages.map((page) => page.map((b) => b.node));

// A small seeded generator, so a failing case can be run again.
function random(seed: number) {
  let value = seed;
  return () => {
    value = (value * 1103515245 + 12345) % 2147483648;
    return value / 2147483648;
  };
}

describe('incremental layout', () => {
  const blocks = Array.from({ length: 40 }, (_, index) => block(40 + (index % 5) * 15));

  it('DOCE-PAGINATION-5.5 reuses every page of a section that did not change', () => {
    const first = layOut(blocks);
    const again = layOut(blocks, first.layout);
    expect(again.pagesLaidOut).toBe(0);
    expect(nodes(again.pages)).toEqual(nodes(first.pages));
  });

  it('DOCE-PAGINATION-5.5 lays out only the pages around a block that kept its height', () => {
    const first = layOut(blocks);
    const edited = blocks.map((b, index) => (index === 20 ? block(b.height) : b));
    const result = layOut(edited, first.layout);
    expect(result.pagesLaidOut).toBeLessThanOrEqual(2);
    expect(nodes(result.pages)).toEqual(fresh(edited));
  });

  it('DOCE-PAGINATION-5.5 lays every page out again when what the pages depend on changed', () => {
    const first = layOut(blocks);
    const result = layoutSectionIncrementally({
      blocks,
      key: 'taller',
      previous: first.layout,
      state: () => '',
      next: (queue, index) => layoutNextPage(queue, index, { pageHeight: PAGE_HEIGHT }),
      page: () => undefined,
    });
    expect(result.pagesLaidOut).toBe(first.pages.length);
  });

  it('DOCE-PAGINATION-5.5 gives the pages a full layout gives after any edit', () => {
    const next = random(7);
    let current = blocks;
    let layout = layOut(current).layout;
    for (let step = 0; step < 300; step += 1) {
      const at = Math.floor(next() * (current.length + 1));
      const kind = next();
      const edited = [...current];
      if (kind < 0.3)
        edited.splice(
          at,
          0,
          block(next() < 0.05 ? 320 : 20 + Math.floor(next() * 120), next() < 0.3),
        );
      else if (kind < 0.5 && edited.length > 1) edited.splice(at, 1);
      else if (at < edited.length) edited[at] = block(20 + Math.floor(next() * 120), next() < 0.2);
      const result = layOut(edited, layout);
      expect(nodes(result.pages)).toEqual(fresh(edited));
      current = edited;
      layout = result.layout;
    }
  }, 20_000);

  it('DOCE-PAGINATION-5.5 reuses the later pages after an edit that adds or removes a page', () => {
    const height = random(3);
    const long = Array.from({ length: 3000 }, () => block(20 + Math.floor(height() * 120)));
    const first = layOut(long);
    const grown = long.map((b, index) => (index === 10 ? block(280) : b));
    const result = layOut(grown, first.layout);
    expect(result.pages.length).toBeGreaterThan(first.pages.length);
    // The pages after the edit fall back onto the old breaks within a few pages, wherever their
    // index: 8 of more than a thousand.
    expect(result.pagesLaidOut).toBeLessThanOrEqual(10);
    expect(nodes(result.pages)).toEqual(fresh(grown));
    const shrunk = layOut(long, result.layout);
    expect(shrunk.pagesLaidOut).toBeLessThanOrEqual(10);
    expect(nodes(shrunk.pages)).toEqual(fresh(long));
  });

  it('DOCE-PAGINATION-5.5 reuses a later page only at an index with its header and footer', () => {
    // Even pages are 40px shorter, as a template whose even pages have a taller header.
    const heightOf = (index: number) => PAGE_HEIGHT - (index % 2 ? 0 : 40);
    const layOutAlternating = (list: readonly LayoutBlock[], previous?: SectionLayout) =>
      layoutSectionIncrementally({
        blocks: list,
        key: 'alternating',
        previous,
        state: () => '',
        geometry: (index) => String(index % 2),
        next: (queue, index) => layoutNextPage(queue, index, { pageHeight: heightOf(index) }),
        page: () => undefined,
      });
    const freshAlternating = (list: readonly LayoutBlock[]) => {
      const queue = [...list];
      const pages: LayoutBlock[][] = [];
      while (queue.length)
        pages.push(layoutNextPage(queue, pages.length, { pageHeight: heightOf(pages.length) }));
      return nodes(pages);
    };
    const next = random(11);
    let current = blocks;
    let layout = layOutAlternating(current).layout;
    for (let step = 0; step < 200; step += 1) {
      const at = Math.floor(next() * current.length);
      const edited = [...current];
      if (next() < 0.5) edited.splice(at, 0, block(20 + Math.floor(next() * 260)));
      else if (edited.length > 1) edited.splice(at, 1);
      const result = layOutAlternating(edited, layout);
      expect(nodes(result.pages)).toEqual(freshAlternating(edited));
      current = edited;
      layout = result.layout;
    }
  }, 20_000);
});
