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
});
