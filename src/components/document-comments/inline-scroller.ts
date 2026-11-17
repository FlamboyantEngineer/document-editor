// The stage that scrolls the pages and their margin sideways, and what of it is shown.

/**
 * The nearest ancestor that scrolls along the inline axis, the page's own scroller included, or
 * null.
 */
export function inlineScroller(element: HTMLElement): Element | null {
  const { defaultView: view, scrollingElement: root } = element.ownerDocument;
  for (let box = element.parentElement; box && view; box = box.parentElement) {
    if (box.scrollWidth <= box.clientWidth) continue;
    if (box === root || /auto|scroll/.test(view.getComputedStyle(box).overflowX)) return box;
  }
  return null;
}

/** What a scroller shows, by its inline edges: the viewport for the page's own scroller. */
export function shownEdges(scroller: Element): { left: number; right: number } {
  if (scroller !== scroller.ownerDocument.scrollingElement) return scroller.getBoundingClientRect();
  return { left: 0, right: scroller.clientWidth };
}
