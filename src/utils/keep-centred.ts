// Keeps an element centred in the area that scrolls it while that area changes width, as when a
// side panel beside it collapses or the window narrows, until the reader scrolls or presses
// anything there.

const CENTRE: ScrollIntoViewOptions = { block: 'center', inline: 'center' };

// The nearest ancestor that scrolls the element, whichever way.
function scrollerOf(element: Element): HTMLElement | null {
  const owner = element.ownerDocument.defaultView;
  for (let at = element.parentElement; at && owner; at = at.parentElement) {
    const { overflowX, overflowY } = owner.getComputedStyle(at);
    if (/auto|scroll/.test(`${overflowX} ${overflowY}`)) return at;
  }
  return null;
}

/**
 * Centres an element in view, both ways, and centres it again each time the area scrolling it
 * changes width; returns what stops that, which the reader's own scrolling or pressing does too.
 */
export function keepCentred(element: Element): () => void {
  element.scrollIntoView?.(CENTRE);
  const scroller = scrollerOf(element);
  const Observer = element.ownerDocument.defaultView?.ResizeObserver;
  if (!scroller || !Observer) return () => undefined;
  let width = scroller.clientWidth;
  const observer = new Observer(() => {
    if (scroller.clientWidth === width) return;
    width = scroller.clientWidth;
    if (element.isConnected) element.scrollIntoView(CENTRE);
  });
  const events = ['wheel', 'pointerdown', 'keydown', 'touchstart'] as const;
  const stop = () => {
    observer.disconnect();
    for (const name of events) scroller.removeEventListener(name, stop);
  };
  observer.observe(scroller);
  for (const name of events) scroller.addEventListener(name, stop, { passive: true });
  return stop;
}
