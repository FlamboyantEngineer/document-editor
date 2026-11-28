import { scrollerOf } from '../../utils/scroll-frame.js';

/** Reports sheets within one viewport height above or below the viewer's scrolling frame. */
export function watchNearbySheets(
  element: HTMLElement,
  sheets: readonly HTMLElement[],
  changed: (entries: readonly IntersectionObserverEntry[]) => void,
) {
  const doc = element.ownerDocument;
  const view = doc.defaultView;
  if (!view?.IntersectionObserver) return null;
  const scroller = scrollerOf(element);
  const frame = scroller === doc.scrollingElement ? null : scroller;
  let observer: IntersectionObserver | null = null;
  let height = -1;
  const watch = () => {
    // Percentage root margins are relative to width, including the top and bottom margins.
    const next = frame?.clientHeight ?? view.innerHeight;
    if (next === height) return;
    height = next;
    observer?.disconnect();
    const current = new view.IntersectionObserver(
      (entries) => {
        if (observer === current) changed(entries);
      },
      { root: frame ?? doc, rootMargin: `${String(height)}px 0px` },
    );
    observer = current;
    for (const sheet of sheets) current.observe(sheet);
  };
  watch();
  view.addEventListener('resize', watch);
  const size = frame && view.ResizeObserver ? new view.ResizeObserver(watch) : null;
  if (frame) size?.observe(frame, { box: 'border-box' });
  return {
    /** Asks for a fresh intersection report even if a link jump leaves the sheet out of view. */
    refresh(sheet: HTMLElement) {
      observer?.unobserve(sheet);
      observer?.observe(sheet);
    },
    disconnect() {
      view.removeEventListener('resize', watch);
      size?.disconnect();
      observer?.disconnect();
      observer = null;
    },
  };
}
