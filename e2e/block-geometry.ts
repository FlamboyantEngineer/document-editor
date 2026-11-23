// Reading the block geometry the pages draw against the one they were laid out with
// (DOCE-LABS-8.10): with the regression lab's `debug` query, each top-level block of a page carries
// its planned height and top (`data-debug-height`, `data-debug-top`) and each page its room
// (`data-debug-used` plus `data-debug-free`). The reader compares each block's drawn box with its
// plan, the gap before it with the planned gap, and the lowest drawn bottom with the page's room.
// Lengths are unscaled CSS pixels, so the zoom does not matter.

import type { Page } from '@playwright/test';

/** What differs: a block's height, the gap above it, or a page's content reaching past its room. */
export type GeometryKind = 'height' | 'gap' | 'overflow';

/** One place where the drawn geometry is not the planned one. */
export interface GeometryMismatch {
  /** The page, counted from 0. */
  readonly page: number;
  /**
   * The block, as `type n#part`: its node type, the how-manieth top-level block of that type it is
   * in the document (from 1, a split block counted once) and its split part; `page` for an
   * overflow.
   */
  readonly block: string;
  readonly kind: GeometryKind;
  readonly planned: number;
  readonly drawn: number;
}

/** The pages' geometry against their plan, in the order drawn. It runs in the page. */
export function readBlockGeometry(page: Page): Promise<GeometryMismatch[]> {
  return page.evaluate(() => {
    // How far a drawn length may differ from its plan: half a pixel, and one layout unit (1/64 px)
    // for every 20 px, as Chromium rounds each line box to layout units.
    const allowed = (length: number) => 0.5 + Math.abs(length) / 1280;
    const round = (value: number) => Math.round(value * 100) / 100;
    const found: GeometryMismatch[] = [];
    const counts = new Map<string, number>();
    const pages = document.querySelectorAll<HTMLElement>(
      ':not(.de-document-viewer) > .de-document-editor__content .pm-page',
    );
    pages.forEach((sheet, index) => {
      const content = sheet.querySelector<HTMLElement>(':scope > .pm-page-content');
      if (!content || !sheet.dataset.debugUsed) return;
      const box = content.getBoundingClientRect();
      const scale = content.offsetWidth > 0 ? box.width / content.offsetWidth : 1;
      const room = Number(sheet.dataset.debugUsed) + Number(sheet.dataset.debugFree);
      let plannedBottom = 0;
      let drawnBottom = 0;
      let lowest = 0;
      let blocks = 0;
      for (const element of content.querySelectorAll<HTMLElement>(':scope > [data-debug-height]')) {
        const type = element.dataset.debugType ?? '';
        const part = Number(element.dataset.splitPartIndex ?? 0);
        if (part === 0) counts.set(type, (counts.get(type) ?? 0) + 1);
        const block = `${type} ${String(counts.get(type) ?? 1)}#${String(part)}`;
        const rect = element.getBoundingClientRect();
        const height = Number(element.dataset.debugHeight);
        const top = Number(element.dataset.debugTop);
        const drawnHeight = rect.height / scale;
        const drawnTop = (rect.top - box.top) / scale;
        // A block with no height, such as an empty template block whose margins collapse through
        // it, has no top of its own to check: the next block's gap is read from the block before.
        if (height < 0.5 && drawnHeight < 0.5) continue;
        if (Math.abs(drawnHeight - height) > allowed(height))
          found.push({
            page: index,
            block,
            kind: 'height',
            planned: round(height),
            drawn: round(drawnHeight),
          });
        const gap = top - plannedBottom;
        const drawnGap = drawnTop - drawnBottom;
        if (Math.abs(drawnGap - gap) > allowed(0))
          found.push({
            page: index,
            block,
            kind: 'gap',
            planned: round(gap),
            drawn: round(drawnGap),
          });
        plannedBottom = top + height;
        drawnBottom = drawnTop + drawnHeight;
        lowest = Math.max(lowest, drawnBottom);
        blocks += 1;
      }
      // A page holding a single block taller than the page overflows by design (DOCE-PAGINATION-5.9).
      if (blocks > 1 && lowest - room > 1)
        found.push({
          page: index,
          block: 'page',
          kind: 'overflow',
          planned: round(room),
          drawn: round(lowest),
        });
    });
    return found;
  });
}

/** The pages whose content the browser drew past their room, by index. */
export async function overflowingPages(page: Page): Promise<number[]> {
  const found = await readBlockGeometry(page);
  return found.filter((each) => each.kind === 'overflow').map((each) => each.page);
}
