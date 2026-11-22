// The pages near the screen (DOCE-PAGINATION-11.6): behind the `textLayout: 'pretext'` option,
// only the pages a reader can reach without a long scroll are drawn on the layout engine's lines.
// A page farther away keeps the browser's lines, which its size does not depend on, so the DOM
// each keystroke walks stays as small as without the option.

import type { EditorView } from 'prosemirror-view';
import { scrollerOf } from '../utils/scroll-frame.js';
import { pageElements } from './page-geometry.js';

/** Which pages are near the screen, by index among the document's pages. */
export interface DrawnPages {
  /** The pages near the screen; null until the first are known, or where nothing can tell. */
  drawn(): ReadonlySet<number> | null;
  /** Watches the view's pages again, after a layout that may have changed them. */
  update(view: EditorView): void;
  destroy(): void;
}

/** How far beyond the screen a page still counts as near it: half a screen above and below. */
const NEAR = '50% 0px';

// The area the margin applies to: the editor's scrolling ancestor, whose clip would otherwise cut
// the margin off; the window when the document scrolls.
function rootOf(view: EditorView): Element | null {
  const scroller = scrollerOf(view.dom);
  return scroller === view.dom.ownerDocument.scrollingElement ? null : scroller;
}

/**
 * Watches the pages of a view, calling `changed` when the set of pages near the screen changes.
 * Without `IntersectionObserver`, as in a test DOM, every page is near. The margin is measured
 * against the view's scrolling frame, found again at each update, since the view may be put in
 * its frame after it is made.
 */
export function watchDrawnPages(view: EditorView, changed: () => void): DrawnPages {
  const Observer = view.dom.ownerDocument.defaultView?.IntersectionObserver;
  if (!Observer) return { drawn: () => null, update: () => undefined, destroy: () => undefined };
  let pages: (HTMLElement | null)[] = [];
  const near = new Set<Element>();
  let known = false;
  let drawn: Set<number> | null = null;
  const watch = (root: Element | null) =>
    new Observer(
      (entries) => {
        let moved = !known;
        known = true;
        for (const { target, isIntersecting } of entries) {
          moved ||= near.has(target) !== isIntersecting;
          if (isIntersecting) near.add(target);
          else near.delete(target);
        }
        if (!moved) return;
        drawn = null;
        changed();
      },
      { root, rootMargin: NEAR },
    );
  let root = rootOf(view);
  let observer = watch(root);
  // Watches every page again in a new frame.
  const reframe = (next: Element | null) => {
    observer.disconnect();
    root = next;
    observer = watch(root);
    near.clear();
    known = false;
    for (const page of pages) if (page) observer.observe(page);
  };
  // Observes the pages a layout added and forgets those it took away; a page kept keeps its place.
  const update = (current: EditorView) => {
    const frame = rootOf(current);
    if (frame !== root) reframe(frame);
    const next = pageElements(current);
    if (next.length === pages.length && next.every((page, index) => page === pages[index])) return;
    const kept = new Set(next);
    for (const page of pages) {
      if (!page || kept.has(page)) continue;
      observer.unobserve(page);
      near.delete(page);
    }
    const old = new Set(pages);
    for (const page of next) if (page && !old.has(page)) observer.observe(page);
    pages = next;
    drawn = null;
  };
  update(view);
  return {
    drawn() {
      if (!known) return null;
      drawn ??= new Set(pages.flatMap((page, index) => (page && near.has(page) ? [index] : [])));
      return drawn;
    },
    update,
    destroy: () => observer.disconnect(),
  };
}
