// Keeps the active margin card in view sideways: where the stage is narrower than the pages and
// their margin, opening or activating a card, or resizing the stage while one is active, scrolls
// the stage along its inline axis just enough to show the card, never up or down.

import type { Key } from '@flamboyantengineer/ui-components/core';
import { useEffect } from 'react';
import { inlineScroller, shownEdges } from './inline-scroller.js';
import { cardElementId } from './use-open-cards.js';

/**
 * Scrolls the element's inline scroller sideways just enough to show it, its start first when it
 * is wider than the scroller.
 */
function revealInline(element: HTMLElement): void {
  const scroller = inlineScroller(element);
  if (!scroller) return;
  const outer = shownEdges(scroller);
  const inner = element.getBoundingClientRect();
  if (inner.left < outer.left) scroller.scrollLeft -= outer.left - inner.left;
  else if (inner.right > outer.right) {
    scroller.scrollLeft += Math.min(inner.right - outer.right, inner.left - outer.left);
  }
}

/** Shows the active card sideways when it becomes active and whenever its stage is resized. */
export function useRevealActiveCard(layer: HTMLElement | null, active: Key | null): void {
  useEffect(() => {
    const document = layer?.ownerDocument;
    // The offer to comment on a selection follows the selection: it never scrolls the stage.
    if (!document || active === null || active === 'draft') return undefined;
    const reveal = () => {
      const card = document.getElementById(cardElementId(String(active)));
      if (card) revealInline(card);
    };
    reveal();
    const scroller = layer && inlineScroller(layer);
    const Observer = document.defaultView?.ResizeObserver;
    if (!scroller || !Observer) return undefined;
    const observer = new Observer(reveal);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [layer, active]);
}
