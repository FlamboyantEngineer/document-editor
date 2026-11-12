// Checks the pages as a view drew them: a page whose content, footnotes or footer reach below its
// own bottom overflows, which means a measurement was wrong, so the layout measures again.

import type { EditorView } from 'prosemirror-view';
import { pageElements } from './page-geometry.js';

/** A page drawn taller than it is. */
export interface PageOverflow {
  /** Its index among the document's pages, from 0. */
  readonly index: number;
  /** How far, in unscaled CSS pixels, what it holds reaches below its content box. */
  readonly by: number;
}

function px(value: string | undefined): number {
  const number = Number.parseFloat(value ?? '');
  return Number.isFinite(number) ? number : 0;
}

// How far a page's regions and content blocks reach below its content box, on screen.
function reach(page: HTMLElement): { readonly by: number; readonly blocks: number } {
  const style = page.ownerDocument.defaultView?.getComputedStyle(page);
  const bottom =
    page.getBoundingClientRect().bottom - px(style?.paddingBottom) - px(style?.borderBottomWidth);
  let lowest = Number.NEGATIVE_INFINITY;
  let blocks = 0;
  for (const region of page.children) {
    lowest = Math.max(lowest, region.getBoundingClientRect().bottom);
    if (!region.classList.contains('pm-page-content')) continue;
    blocks = region.childElementCount;
    const last = region.lastElementChild;
    if (last) lowest = Math.max(lowest, last.getBoundingClientRect().bottom);
  }
  return { by: lowest - bottom, blocks };
}

/**
 * The pages a view of a paged document drew taller than they are, beyond a pixel. A page holding a
 * single block is left out: a block taller than a page and not split overflows by design.
 */
export function findPageOverflow(
  view: EditorView,
  { scale = 1 }: { scale?: number | undefined } = {},
): PageOverflow[] {
  const ratio = scale > 0 ? scale : 1;
  const found: PageOverflow[] = [];
  pageElements(view).forEach((page, index) => {
    if (!page) return;
    const { by, blocks } = reach(page);
    if (blocks > 1 && by / ratio > 1) found.push({ index, by: by / ratio });
  });
  return found;
}
