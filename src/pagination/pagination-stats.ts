// What a pagination has done since it was made, counted as it lays the pages out, so a test or a
// host's telemetry can tell a layout that measured and rebuilt little from one that did it all.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type MeasureCache, measureCacheCounts } from './measure-blocks.js';

/** A pagination's counters since it was made (`Pagination.stats`). */
export interface PaginationStats {
  /** Layouts run. */
  readonly layouts: number;
  /** Blocks measured in the measuring view rather than taken from the cache. */
  readonly blocksMeasured: number;
  /** Blocks taken from the cache. */
  readonly cacheHits: number;
  /** Blocks the cache did not hold. */
  readonly cacheMisses: number;
  /** Sections laid out with at least one block measured again. */
  readonly sectionsRelaid: number;
  /** Sections laid out from cached measurements alone. */
  readonly sectionsReused: number;
  /** Pages a layout kept as they were. */
  readonly pagesReused: number;
  /** Pages a layout built anew. */
  readonly pagesRebuilt: number;
}

type LayoutCounts = Pick<
  PaginationStats,
  'layouts' | 'sectionsRelaid' | 'sectionsReused' | 'pagesReused' | 'pagesRebuilt'
>;

// The pages of a paged document, each section's in order.
function pagesOf(doc: ProseMirrorNode): ProseMirrorNode[] {
  const pages: ProseMirrorNode[] = [];
  doc.forEach((section) => {
    if (section.type.name !== 'page_section') return;
    section.forEach((page) => {
      if (page.type.name === 'page') pages.push(page);
    });
  });
  return pages;
}

/** Counts what a pagination's layouts do, beside what its measure cache serves. */
export function createPaginationCounter(cache: MeasureCache) {
  const counts: { -readonly [Key in keyof LayoutCounts]: number } = {
    layouts: 0,
    sectionsRelaid: 0,
    sectionsReused: 0,
    pagesReused: 0,
    pagesRebuilt: 0,
  };
  return {
    /** Counts a section laid out, by how many of its blocks were measured again. */
    section({ blocksMeasured }: { readonly blocksMeasured: number }) {
      if (blocksMeasured > 0) counts.sectionsRelaid += 1;
      else counts.sectionsReused += 1;
    },
    /** Counts a layout that moved the editor from one document's pages onto another's. */
    layout(before: ProseMirrorNode, after: ProseMirrorNode) {
      counts.layouts += 1;
      const kept = new Set(pagesOf(before));
      for (const page of pagesOf(after)) {
        if (kept.has(page)) counts.pagesReused += 1;
        else counts.pagesRebuilt += 1;
      }
    },
    stats(): PaginationStats {
      const { hits, misses, measured } = measureCacheCounts(cache);
      return { ...counts, blocksMeasured: measured, cacheHits: hits, cacheMisses: misses };
    },
  };
}
