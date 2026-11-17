// The area that scrolls an element vertically, and the part of the window it shows, so the editor
// scrolls its own frame and not every scrolling ancestor, as `Element.scrollIntoView` does.

/** The nearest ancestor that scrolls an element vertically, else the window's scrolling element. */
export function scrollerOf(element: Element): Element | null {
  const { ownerDocument } = element;
  const owner = ownerDocument.defaultView;
  for (let at = element.parentElement; at && owner; at = at.parentElement) {
    if (/auto|scroll/.test(owner.getComputedStyle(at).overflowY)) return at;
  }
  return ownerDocument.scrollingElement;
}

/** The part of the window, top to bottom, that a scroller shows. */
export function frameOf(scroller: Element): { top: number; bottom: number } {
  const owner = scroller.ownerDocument;
  if (scroller === owner.scrollingElement) {
    return { top: 0, bottom: owner.defaultView?.innerHeight ?? scroller.clientHeight };
  }
  const { top } = scroller.getBoundingClientRect();
  return { top, bottom: top + scroller.clientHeight };
}
