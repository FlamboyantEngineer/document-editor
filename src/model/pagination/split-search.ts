/**
 * The search for the tallest head of a split that fits the room its own footnotes leave
 * (DOCE-PAGINATION-2.7).
 */
import type { LayoutBlock, SplitBlock } from './page-layout.js';

// The most splits a block is tried at before its fitting head is taken.
const SPLIT_TRIES = 12;

/** A block's split at the heights of one page. */
interface SplitRoom {
  /** The room the page has with none of the block's footnotes. */
  readonly top: number;
  /** The room the page has with every footnote of the block. */
  readonly everyNote: number;
  /** The block split at a height; null when the split refuses it. */
  readonly at: (height: number) => SplitBlock | null;
  /** The room the page has with the footnotes a head cites. */
  readonly roomFor: (head: LayoutBlock) => number;
}

// Every head that fits is taller than low and shorter than high. A split refuses a height whose
// head or tail would be too short, so a refusal below a height that split is a low bound, one above
// it a high bound, and the page's whole room counts as above every head.
interface Bounds {
  low: number;
  high: number;
  next: number;
  split?: number;
  best?: SplitBlock;
}

/**
 * Split at the room with none of the block's footnotes; while a head's own footnotes leave it too
 * little, at the room they leave; otherwise between the bounds, for the tallest head that fits.
 * With no head that fits, the split at the room with every footnote, such as a table row taller
 * than a page that its rule sets alone on an empty page.
 */
export function searchSplit(room: SplitRoom): SplitBlock | null {
  const { top, everyNote, at, roomFor } = room;
  const first = at(top);
  if (first && first.head.height <= roomFor(first.head)) return first;
  const bounds: Bounds = {
    low: 0,
    high: top,
    next: first ? roomFor(first.head) : everyNote,
    ...(first ? { split: top } : {}),
  };
  for (let count = 1; count < SPLIT_TRIES && bounds.high - bounds.low >= 1; count += 1) {
    narrow(bounds, room);
  }
  return bounds.best ?? at(everyNote);
}

// One try: the next height inside the bounds, or their middle, and what its split says of them.
function narrow(bounds: Bounds, { at, roomFor }: SplitRoom) {
  const { low, high, next } = bounds;
  const height = next > low && next < high ? next : (low + high) / 2;
  const parts = at(height);
  if (!parts) {
    if (bounds.split === undefined || height < bounds.split) bounds.low = height;
    else bounds.high = height;
    bounds.next = (bounds.low + bounds.high) / 2;
  } else if (parts.head.height > roomFor(parts.head)) {
    Object.assign(bounds, { high: height, split: height, next: roomFor(parts.head) });
  } else {
    Object.assign(bounds, { low: height, split: height, next: (height + high) / 2 });
    if (!bounds.best || parts.head.height >= bounds.best.head.height) bounds.best = parts;
  }
}
