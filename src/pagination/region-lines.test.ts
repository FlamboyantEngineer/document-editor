import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import type { BlockGeometry, RegionGeometry } from '../layout-engine/blocks/types.js';
import { holdInsertedTexts } from './inserted-texts.js';
import { createNestedLines, type LinesRecorder } from './nested-lines.js';
import { createRegionLines, REGIONS_KEPT_PER_NODE } from './region-lines.js';

// A footer node, and regions laid out for it as the engine would, counting each layout.
function footerRegions() {
  const footer = documentSchema.node('paragraph', null, documentSchema.text('Page'));
  let laidOut = 0;
  const geometry = {
    layoutRegion: (): RegionGeometry => {
      laidOut += 1;
      return { ok: true, height: 10, gap: 0, children: [] };
    },
  };
  const regions = createRegionLines({
    geometry,
    recorder: { lines: null },
    widthOf: () => 100,
    footnoteOf: () => undefined,
  });
  const lay = (page: number, pages: number) =>
    regions.lay(
      footer,
      null,
      new Map([
        ['page.current', String(page)],
        ['page.total', String(pages)],
      ]),
    );
  return { lay, laidOut: () => laidOut };
}

describe('the laid header and footer regions', () => {
  it('DOCE-PAGINATION-11.10 keeps a region laid out for each page number it showed', () => {
    const { lay, laidOut } = footerRegions();
    for (let page = 1; page <= 10; page += 1) lay(page, 10);
    for (let page = 1; page <= 10; page += 1) lay(page, 10);
    expect(laidOut()).toBe(10);
  });

  it('DOCE-PAGINATION-11.10 keeps at most a bounded number per node under many page counts', () => {
    const { lay, laidOut } = footerRegions();
    // A document grown page by page: every page is laid under every count it came to.
    for (let pages = 1; pages <= 300; pages += 1)
      for (let page = 1; page <= pages; page += 1) lay(page, pages);
    const grown = laidOut();
    // The latest count's pages are kept; the first count's region was dropped.
    for (let page = 1; page <= 300; page += 1) lay(page, 300);
    expect(laidOut()).toBe(grown);
    lay(1, 1);
    expect(laidOut()).toBe(grown + 1);
  });

  it('DOCE-PAGINATION-11.10 drops the region used least recently first', () => {
    const { lay, laidOut } = footerRegions();
    for (let page = 1; page <= REGIONS_KEPT_PER_NODE; page += 1) lay(page, 1);
    lay(1, 1);
    lay(REGIONS_KEPT_PER_NODE + 1, 1);
    const laid = laidOut();
    lay(1, 1);
    expect(laidOut()).toBe(laid);
    lay(2, 1);
    expect(laidOut()).toBe(laid + 1);
  });

  it('DOCE-PAGINATION-11.10 lays a footnote area out again when its entries are numbered again', () => {
    let laidOut = 0;
    const geometry = {
      layoutRegion: (): RegionGeometry => {
        laidOut += 1;
        return { ok: true, height: 10, gap: 0, children: [] };
      },
    };
    let number = '1';
    const regions = createRegionLines({
      geometry,
      recorder: { lines: null },
      widthOf: () => 100,
      footnoteOf: () => number,
    });
    const entry = documentSchema.node('footnote_entry', { footnoteId: 'n1' }, [
      documentSchema.text('A note'),
    ]);
    const area = documentSchema.node('page_footnotes', null, [entry]);
    regions.lay(area, null);
    regions.lay(area, null);
    expect(laidOut).toBe(1);
    // Footnotes were added before it: the same entry now draws a wider number.
    number = '10';
    regions.lay(area, null);
    expect(laidOut).toBe(2);
  });
});

describe('a layout that throws', () => {
  it('DOCE-PAGINATION-11.10 stops recording lines when a region layout throws', () => {
    const recorder: LinesRecorder = { lines: null };
    const geometry = {
      layoutRegion: (): RegionGeometry => {
        throw new Error('a host rule failed');
      },
    };
    const regions = createRegionLines({
      geometry,
      recorder,
      widthOf: () => 100,
      footnoteOf: () => undefined,
    });
    const footer = documentSchema.node('paragraph', null, documentSchema.text('Page'));
    expect(() => regions.lay(footer, null)).toThrow('a host rule failed');
    expect(recorder.lines).toBeNull();
  });

  it('DOCE-PAGINATION-11.2 stops recording lines and labels when a container layout throws', () => {
    const recorder: LinesRecorder = { lines: null };
    const geometry = {
      layoutBlock: (): BlockGeometry => {
        throw new Error('a host rule failed');
      },
    };
    const nested = createNestedLines({
      words: holdInsertedTexts(),
      markupKey: () => '',
      geometry,
      recorder,
      widthOf: () => 100,
      footnoteOf: () => undefined,
    });
    const quote = documentSchema.node('blockquote', null, [
      documentSchema.node('paragraph', null, documentSchema.text('Quoted')),
    ]);
    expect(() => nested.lines(quote, null, { labelOf: () => 'Figure 1' })).toThrow(
      'a host rule failed',
    );
    expect(recorder.lines).toBeNull();
    expect(recorder.labelOf ?? null).toBeNull();
  });
});
