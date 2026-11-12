// Checks the pages as a view drew them: a page whose content, footnotes or footer reach below its
// own bottom overflows, which means a measurement was wrong, so the layout measures again.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { keepCaretInPlace } from './caret.js';
import { isPaginationTransaction, pageMetrics } from './layout-marks.js';
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

/** What a projection does once its view draws a layout. */
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

/**
 * Has the view that renders a projection check the pages each layout draws, a layout that left
 * them as they were too, and the pages a change draws (DOCE-PAGINATION-5.9), with the caret put
 * back where it was on screen before the layout (`caretBefore`, DOCE-PAGINATION-5.8).
 */
export function checkDrawnPages(
  draws: () => DrawChecks,
  caretBefore: (doc: ProseMirrorNode) => number | null,
): Plugin {
  const key = new PluginKey<number>('drawn-pages');
  const check = (view: EditorView) => {
    const caret = caretBefore(view.state.doc);
    if (pageMetrics(view.state)) draws().drawn(view, caret);
  };
  return new Plugin({
    key,
    // The layouts the view took, so a layout that left the pages as they were is checked too.
    state: {
      init: () => 0,
      apply: (tr, layouts) => (isPaginationTransaction(tr) ? layouts + 1 : layouts),
    },
    view(view) {
      check(view);
      return {
        update(updated, previous) {
          const laidOut = key.getState(updated.state) !== key.getState(previous);
          if (laidOut || updated.state.doc !== previous.doc) check(updated);
        },
      };
    },
  });
}
