import { isElement } from '../../utils/is-element.js';
import { scrollerOf } from '../../utils/scroll-frame.js';

// A browser that takes only an element or null as the root throws for a document; the implicit
// root, the top-level viewport, is then the nearest it can watch.
function createObserver(
  view: Window & typeof globalThis,
  callback: IntersectionObserverCallback,
  init: { readonly root: Element | Document; readonly rootMargin: string },
): IntersectionObserver {
  try {
    return new view.IntersectionObserver(callback, init);
  } catch (error) {
    if (init.root instanceof view.Element) throw error;
    return new view.IntersectionObserver(callback, { ...init, root: null });
  }
}

/**
 * Reports sheets within one viewport height above or below the viewer's scrolling frame. The frame
 * is found again when another ancestor scrolls, when the viewport starts scrolling in place of a
 * container, and when the viewer's size changes, so a viewer whose frame changes keeps drawing
 * the pages near it (DOCE-PAGINATION-13.6).
 */
export function watchNearbySheets(
  element: HTMLElement,
  sheets: readonly HTMLElement[],
  changed: (entries: readonly IntersectionObserverEntry[]) => void,
) {
  const doc = element.ownerDocument;
  const view = doc.defaultView;
  if (!view?.IntersectionObserver) return null;
  const frameOf = () => {
    const scroller = scrollerOf(element);
    return scroller === doc.scrollingElement ? null : scroller;
  };
  let frame = frameOf();
  let observer: IntersectionObserver | null = null;
  let height = -1;
  const watch = () => {
    // Percentage root margins are relative to width, including the top and bottom margins.
    const next = frame?.clientHeight ?? view.innerHeight;
    if (next === height) return;
    height = next;
    observer?.disconnect();
    const current = createObserver(
      view,
      (entries) => {
        if (observer === current) changed(entries);
      },
      { root: frame ?? doc, rootMargin: `${String(height)}px 0px` },
    );
    observer = current;
    for (const sheet of sheets) current.observe(sheet);
  };
  const size = view.ResizeObserver ? new view.ResizeObserver(watch) : null;
  if (frame) size?.observe(frame, { box: 'border-box' });
  watch();
  // A new frame is watched afresh, its size followed in place of the old one's.
  const findFrame = () => {
    if (!element.isConnected) return;
    const next = frameOf();
    if (next === frame) return;
    if (frame) size?.unobserve(frame);
    frame = next;
    if (frame) size?.observe(frame, { box: 'border-box' });
    height = -1;
    watch();
  };
  const scrolled = (event: Event) => {
    const { target } = event;
    const viewportScrolled = target === doc && frame !== null;
    const ancestorScrolled = target !== frame && isElement(target) && target.contains(element);
    if (viewportScrolled || ancestorScrolled) findFrame();
  };
  doc.addEventListener('scroll', scrolled, { capture: true, passive: true });
  const moved = view.ResizeObserver ? new view.ResizeObserver(findFrame) : null;
  moved?.observe(element);
  view.addEventListener('resize', watch);
  return {
    /** Asks for a fresh intersection report even if a link jump leaves the sheet out of view. */
    refresh(sheet: HTMLElement) {
      observer?.unobserve(sheet);
      observer?.observe(sheet);
    },
    disconnect() {
      view.removeEventListener('resize', watch);
      doc.removeEventListener('scroll', scrolled, { capture: true });
      moved?.disconnect();
      size?.disconnect();
      observer?.disconnect();
      observer = null;
    },
  };
}
