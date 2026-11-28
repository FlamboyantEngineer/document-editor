// What a projection's layouts have done since it was made, counted as it lays the pages out, so a
// test or a host's telemetry can tell a layout that laid out and rebuilt little from one that did it all.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { SectionReport } from './layout-document.js';

/** What a projection's layouts did since it was made (`PagedProjection.stats`). */
export interface PaginationStats {
  /** Layouts run. */
  readonly layouts: number;
  /** Blocks the layout engine laid out anew rather than taking from what it kept. */
  readonly blocksMeasured: number;
  /** Sections laid out with at least one block laid out anew. */
  readonly sectionsRelaid: number;
  /** Sections laid out from the blocks the engine kept alone. */
  readonly sectionsReused: number;
  /** Pages broken from their blocks; a layout reuses the others from the one before it. */
  readonly pagesLaidOut: number;
  /** Pages the editor drew taller than they are after a layout (`findPageOverflow`), summed. */
  readonly overflowPages: number;
  /** Pages a layout kept as they were. */
  readonly pagesReused: number;
  /** Pages a layout built anew. */
  readonly pagesRebuilt: number;
  /**
   * Layouts that stopped with page numbers that still moved after their last pass: a list of
   * contents' digits, or the page count a header or footer shows (DOCE-PAGINATION-10.11, 11.10).
   */
  readonly unsettled: number;
}

type LayoutCounts = Pick<
  PaginationStats,
  | 'layouts'
  | 'sectionsRelaid'
  | 'sectionsReused'
  | 'pagesLaidOut'
  | 'overflowPages'
  | 'pagesReused'
  | 'pagesRebuilt'
  | 'unsettled'
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

/** Counts what a projection's layouts do, beside the blocks its layout engine has laid out (`laid`). */
export function createPaginationCounter(laid: () => number) {
  const counts: { -readonly [Key in keyof LayoutCounts]: number } = {
    layouts: 0,
    sectionsRelaid: 0,
    sectionsReused: 0,
    pagesLaidOut: 0,
    overflowPages: 0,
    pagesReused: 0,
    pagesRebuilt: 0,
    unsettled: 0,
  };
  const reports = {
    /** Counts a section laid out, by how many of its blocks were measured and pages laid out. */
    onSection({ blocksMeasured, pagesLaidOut }: SectionReport) {
      counts.pagesLaidOut += pagesLaidOut;
      if (blocksMeasured > 0) counts.sectionsRelaid += 1;
      else counts.sectionsReused += 1;
    },
    /** Counts a layout that stopped with page numbers that still moved. */
    onUnsettled() {
      counts.unsettled += 1;
    },
  };
  return {
    /** What a layout reports, counted. */
    reports,
    /** Counts the pages a layout's check found drawn taller than they are. */
    overflow(pages: number) {
      counts.overflowPages += pages;
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
      return { ...counts, blocksMeasured: laid() };
    },
  };
}
