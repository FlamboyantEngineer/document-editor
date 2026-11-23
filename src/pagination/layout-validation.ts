// Checks the pages as a view drew them: a page whose content, footnotes or footer reach below its
// own bottom overflows, which means a measurement was wrong, so the layout measures again.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { keepCaretInPlace } from './caret.js';
import { forcedLinesKey } from './forced-lines.js';
import { isPaginationTransaction, pageMetrics } from './layout-marks.js';
import type { MeasureCache } from './measure-cache.js';
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
  { scale = 1, pages }: { scale?: number | undefined; pages?: PageFilter | undefined } = {},
): PageOverflow[] {
  const ratio = scale > 0 ? scale : 1;
  const found: PageOverflow[] = [];
  pageElements(view).forEach((page, index) => {
    if (!page || (pages && !pages(index))) return;
    const { by, blocks } = reach(page);
    if (blocks > 1 && by / ratio > 1) found.push({ index, by: by / ratio });
  });
  return found;
}

/** Which pages to read, by index; every page without one. */
type PageFilter = (index: number) => boolean;

// The pages drawn on the layout engine's lines when only those near the screen are
// (DOCE-PAGINATION-11.6): a page farther away keeps the browser's lines, which are not the ones it
// was laid out with, and reading it would lay it out.
function drawnOnly(view: EditorView): PageFilter | undefined {
  const forced = forcedLinesKey.getState(view.state);
  const drawn = forced?.drawn;
  if (!forced || !drawn) return undefined;
  return (index) => drawn.has(index) || index === forced.caret;
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
      const overflow = findPageOverflow(view, { scale: options.scale?.(), pages: drawnOnly(view) });
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
 * them as they were too (DOCE-PAGINATION-5.9), with the caret put back where it was on screen
 * before the layout (`caretBefore`, DOCE-PAGINATION-5.8). A change drawn between layouts is not
 * checked: reading every page's box on each keystroke would lay the document out each time.
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
          if (key.getState(updated.state) !== key.getState(previous)) check(updated);
        },
      };
    },
  });
}

/** A forced block the browser drew on other lines than the layout engine computed. */
export interface WrappedBlock {
  /** Its element id, or empty. */
  readonly elementId: string;
  /** The lines the engine computed for it, and those the browser drew. */
  readonly computed: number;
  readonly drawn: number;
}

// The boxes an element's content is drawn in: its text's, each hard break's, so a line that holds
// only a break counts, and each inline atom's own box, as an atom such as typeset math draws parts
// of itself above and below its line.
function contentBoxes(element: Element): DOMRect[] {
  const boxes: DOMRect[] = [];
  const range = element.ownerDocument.createRange();
  const visit = (node: Node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) {
        range.selectNodeContents(child);
        boxes.push(...range.getClientRects());
      } else if (child.nodeType === 1) {
        const inner = child as HTMLElement;
        if (inner.contentEditable === 'false' || inner.tagName === 'BR')
          boxes.push(...inner.getClientRects());
        else visit(inner);
      }
    }
  };
  visit(element);
  return boxes;
}

// The distinct line boxes an element's content is drawn on: boxes that overlap by half the
// shorter one's height share a line, so an inline atom taller than the text joins its line.
function drawnLineCount(element: Element): number {
  const lines: { top: number; bottom: number }[] = [];
  for (const rect of contentBoxes(element)) {
    if (rect.height === 0) continue;
    const line = lines.find(
      (each) =>
        Math.min(each.bottom, rect.bottom) - Math.max(each.top, rect.top) >
        Math.min(each.bottom - each.top, rect.height) / 2,
    );
    if (!line) lines.push({ top: rect.top, bottom: rect.bottom });
    else {
      line.top = Math.min(line.top, rect.top);
      line.bottom = Math.max(line.bottom, rect.bottom);
    }
  }
  return Math.max(1, lines.length);
}

/**
 * The guard on forced lines (DOCE-PAGINATION-11.4): each block drawn on the layout engine's lines
 * (`de-forced-lines`) whose drawn lines differ in number from the computed ones, as when the
 * browser wrapped a line by itself. It reads every forced block's boxes, so it is for tests and
 * development, not for every layout.
 */
export function findWrappedLines(root: ParentNode): WrappedBlock[] {
  const found: WrappedBlock[] = [];
  for (const block of root.querySelectorAll<HTMLElement>('.de-forced-lines')) {
    const computed = Number(block.dataset.lines);
    const drawn = drawnLineCount(block);
    if (computed !== drawn) found.push({ elementId: block.dataset.id ?? '', computed, drawn });
  }
  return found;
}
