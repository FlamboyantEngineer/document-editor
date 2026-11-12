// What of the document the reader sees: the page in view, which the status bar reports (D17), and
// the elements on screen with their rects, which the editor feeds to the host. Both are measured
// against the part of the window the document's scrolling ancestors leave visible, so they hold
// whether the editor scrolls the document itself or the page does.

import type { EditorView } from 'prosemirror-view';
import { useEffect, useRef, useState } from 'react';
import { DATA_ID_ATTR } from '../../model/schema/dom-attributes.js';

/** An element of the document on screen, by its element id. */
export interface VisibleElement {
  readonly elementId: string;
  /** Its boxes in the window, one for each page it shows on, top to bottom. */
  readonly rects: readonly DOMRectReadOnly[];
}

/** What the reader sees of the document. */
export interface DocumentViewport {
  /** The page taking up most of the visible document, from 1; null before it is laid out. */
  readonly page: number | null;
  /** The pages on screen, from 1, in order. */
  readonly pages: readonly number[];
}

// The marks that carry element ids; the feed reports the elements, not the marked text.
const ELEMENTS = `[${DATA_ID_ATTR}]:not(mark, ins, del)`;
const NO_PAGES: DocumentViewport = { page: null, pages: [] };

interface Band {
  readonly top: number;
  readonly bottom: number;
}

// Whether an element clips what it holds to its own box.
function isClipping(owner: Window, element: Element): boolean {
  const { overflowX, overflowY } = owner.getComputedStyle(element);
  return overflowY !== 'visible' || overflowX !== 'visible';
}

// The window's height the document's scrolling ancestors leave visible.
function visibleBand(view: EditorView): Band {
  const { ownerDocument } = view.dom;
  const owner = ownerDocument.defaultView;
  let top = 0;
  let bottom = owner?.innerHeight ?? 0;
  for (let at = view.dom.parentElement; at && at !== ownerDocument.body; at = at.parentElement) {
    if (!owner || !isClipping(owner, at)) continue;
    const rect = at.getBoundingClientRect();
    top = Math.max(top, rect.top);
    bottom = Math.min(bottom, rect.bottom);
  }
  return { top, bottom };
}

// The document's pages, or the document as one page while it shows none, as in the web layout.
function pagesOf(view: EditorView): readonly Element[] {
  const pages = view.dom.querySelectorAll('.pm-page');
  return pages.length > 0 ? [...pages] : [view.dom];
}

// The index of the first page reaching below the band's top, found by halving since the pages run
// down the document in order.
function firstBelow(pages: readonly Element[], top: number): number {
  let low = 0;
  let high = pages.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((pages[middle]?.getBoundingClientRect().bottom ?? 0) > top) high = middle;
    else low = middle + 1;
  }
  return low;
}

// The pages crossing the band, by index, each with how much of it it takes.
function pagesInBand(pages: readonly Element[], band: Band) {
  const shown: { index: number; height: number }[] = [];
  for (let index = firstBelow(pages, band.top); index < pages.length; index += 1) {
    const rect = pages[index]?.getBoundingClientRect();
    if (!rect || rect.top >= band.bottom) break;
    const height = Math.min(rect.bottom, band.bottom) - Math.max(rect.top, band.top);
    if (height > 0) shown.push({ index, height });
  }
  return shown;
}

/** The page in view and the pages on screen, as the window shows the view now. */
export function measureViewport(view: EditorView): DocumentViewport {
  if (!view.dom.querySelector('.pm-page')) return NO_PAGES;
  const shown = pagesInBand(pagesOf(view), visibleBand(view));
  if (shown.length === 0) return NO_PAGES;
  const most = shown.reduce((best, entry) => (entry.height > best.height ? entry : best));
  return { page: most.index + 1, pages: shown.map((entry) => entry.index + 1) };
}

/** The elements with an element id on screen, in document order, nested ones included. */
export function measureVisibleElements(view: EditorView): readonly VisibleElement[] {
  const band = visibleBand(view);
  const pages = pagesOf(view);
  const found = new Map<string, DOMRectReadOnly[]>();
  for (const { index } of pagesInBand(pages, band)) {
    for (const element of pages[index]?.querySelectorAll(ELEMENTS) ?? []) {
      const rect = element.getBoundingClientRect();
      if (rect.bottom <= band.top || rect.top >= band.bottom || rect.height === 0) continue;
      const id = element.getAttribute(DATA_ID_ATTR) ?? '';
      found.set(id, [...(found.get(id) ?? []), rect]);
    }
  }
  return [...found].map(([elementId, rects]) => ({ elementId, rects }));
}

// Calls `measure` once a frame while anything scrolls, the window resizes or the view's elements
// change, as when its pages are laid out again.
function useViewportFrames(view: EditorView | null, measure: () => void) {
  const latest = useRef(measure);
  useEffect(() => {
    latest.current = measure;
  });
  useEffect(() => {
    const owner = view?.dom.ownerDocument.defaultView;
    if (!view || !owner) return undefined;
    let frame = 0;
    const schedule = () => {
      if (frame === 0) {
        frame = owner.requestAnimationFrame(() => {
          frame = 0;
          latest.current();
        });
      }
    };
    schedule();
    const changes = new owner.MutationObserver(schedule);
    changes.observe(view.dom, { childList: true, subtree: true });
    owner.document.addEventListener('scroll', schedule, { capture: true, passive: true });
    owner.addEventListener('resize', schedule);
    return () => {
      changes.disconnect();
      owner.cancelAnimationFrame(frame);
      owner.document.removeEventListener('scroll', schedule, { capture: true });
      owner.removeEventListener('resize', schedule);
    };
  }, [view, latest]);
}

/** The page in view and the pages on screen, following scrolling and each new layout. */
export function useDocumentViewport(view: EditorView | null): DocumentViewport {
  const [viewport, setViewport] = useState(NO_PAGES);
  useViewportFrames(view, () => {
    if (!view) return;
    const next = measureViewport(view);
    setViewport((current) =>
      current.page === next.page && current.pages.join() === next.pages.join() ? current : next,
    );
  });
  return viewport;
}

/**
 * Tells `onChange` the elements on screen each time the set of them changes, as the reader scrolls
 * or the document changes or is laid out again.
 */
export function useVisibleElementsFeed(
  view: EditorView | null,
  onChange: ((elements: readonly VisibleElement[]) => void) | undefined,
) {
  const last = useRef<string | null>(null);
  useViewportFrames(onChange ? view : null, () => {
    if (!view || !onChange) return;
    const elements = measureVisibleElements(view);
    const ids = elements.map((element) => element.elementId).join('\n');
    if (ids === last.current) return;
    last.current = ids;
    onChange(elements);
  });
}
