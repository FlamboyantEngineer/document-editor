// Where the margin's markers sit: beside the page each one's text is on, as its card would, but
// kept inside what the stage shows, so that a marker whose page edge is scrolled out of view
// sideways stays in view and pressable.

import { layerScale, marginOf } from './anchor-rects.js';
import { inlineScroller, shownEdges } from './inline-scroller.js';

// The width a marker takes on screen: the narrowest entry of the margin, a marker whose card is
// closed.
function markerWidth(margin: Element): number {
  let narrowest = Infinity;
  for (const entry of margin.children) {
    narrowest = Math.min(narrowest, entry.getBoundingClientRect().width);
  }
  return Number.isFinite(narrowest) ? narrowest : 0;
}

/**
 * Each marker's place, in pixels from the margin's inline-start edge, by annotation key: its card's
 * offset beside its page, moved back inside the stage's shown width where the stage is scrolled so
 * that the page's edge is out of view.
 */
export function placeMarkers(
  layer: HTMLElement,
  offsets: ReadonlyMap<string, number>,
): ReadonlyMap<string, number> {
  const margin = marginOf(layer);
  const scroller = inlineScroller(layer);
  if (!margin || !scroller) return offsets;
  const scale = layerScale(layer);
  const start = margin.getBoundingClientRect().left;
  const shown = shownEdges(scroller);
  const first = (shown.left - start) / scale;
  const last = Math.max(first, (shown.right - start - markerWidth(margin)) / scale);
  const placed = new Map<string, number>();
  for (const [key, offset] of offsets) {
    placed.set(key, Math.round(Math.min(Math.max(offset, first), last)));
  }
  return placed;
}

/** Whether a scroll moved the box that scrolled sideways, given where it was last. */
export function scrolledSideways(box: Element, last: WeakMap<Element, number>): boolean {
  const moved = last.get(box) !== box.scrollLeft;
  last.set(box, box.scrollLeft);
  return moved;
}
