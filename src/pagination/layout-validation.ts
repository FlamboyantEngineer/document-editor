// Checks the pages as a view drew them: a page whose content, footnotes or footer reach below its
// own bottom overflows, which means a measurement was wrong, so the layout measures again.

import type { EditorView } from 'prosemirror-view';
import { keepCaretInPlace } from './caret.js';
import type { MeasureCache } from './measure-blocks.js';
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

// The bottom of an element on screen; an element drawn without a box, such as an empty region
// hidden by its styles, reaches nowhere, rather than to the top of the viewport.
function bottomOf(element: Element): number {
  return element.getClientRects().length
    ? element.getBoundingClientRect().bottom
    : Number.NEGATIVE_INFINITY;
}

// How far a page's regions and content blocks reach below its content box, on screen.
function reach(page: HTMLElement): { readonly by: number; readonly blocks: number } {
  const style = page.ownerDocument.defaultView?.getComputedStyle(page);
  const bottom =
    page.getBoundingClientRect().bottom - px(style?.paddingBottom) - px(style?.borderBottomWidth);
  let lowest = Number.NEGATIVE_INFINITY;
  let blocks = 0;
  for (const region of page.children) {
    lowest = Math.max(lowest, bottomOf(region));
    if (!region.classList.contains('pm-page-content')) continue;
    blocks = region.childElementCount;
    const last = region.lastElementChild;
    if (last) lowest = Math.max(lowest, bottomOf(last));
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

/** What a pagination does once the editor draws a layout. */
export interface DrawChecks {
  /** The caret back where it was on screen (`keepCaretInPlace`), and the drawn pages checked. */
  drawn(view: EditorView, caret: number | null): void;
  /** A change came: the next overflow measures again. */
  changed(): void;
}

/**
 * Checks each layout the editor draws: puts the caret back where it was on screen, counts the
 * pages drawn taller than they are, and, once after each change, forgets every measurement and
 * asks for a layout when one overflows.
 */
export function checkDraws(options: {
  readonly scale?: (() => number) | undefined;
  readonly cache: MeasureCache;
  readonly count: (pages: number) => void;
  readonly request: () => void;
}): DrawChecks {
  let corrected = false;
  return {
    drawn(view, caret) {
      keepCaretInPlace(view, caret);
      const overflow = findPageOverflow(view, { scale: options.scale?.() });
      options.count(overflow.length);
      if (!overflow.length || corrected) return;
      corrected = true;
      options.cache.clear();
      options.request();
    },
    changed() {
      corrected = false;
    },
  };
}
