// Keeps the active margin card in view sideways: where the stage is narrower than the pages and
// their margin, opening or activating a card, or resizing the stage while one is active, scrolls
// the stage along its inline axis just enough to show the card, never up or down.

import type { Key } from '@flamboyantengineer/ui-components/core';
import { useEffect } from 'react';
import { cardElementId } from './use-open-cards.js';

// The nearest ancestor that scrolls along the inline axis, the page's own scroller included, or
// null.
function inlineScroller(element: HTMLElement): Element | null {
  const { defaultView: view, scrollingElement: root } = element.ownerDocument;
  for (let box = element.parentElement; box && view; box = box.parentElement) {
    if (box.scrollWidth <= box.clientWidth) continue;
    if (box === root || /auto|scroll/.test(view.getComputedStyle(box).overflowX)) return box;
  }
  return null;
}

// What a scroller shows, by its inline edges: the viewport for the page's own scroller.
function shownEdges(scroller: Element): { left: number; right: number } {
  if (scroller !== scroller.ownerDocument.scrollingElement) return scroller.getBoundingClientRect();
  return { left: 0, right: scroller.clientWidth };
}

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
