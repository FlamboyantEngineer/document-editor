// A page's footnote area as the layout engine lays it out: how tall each entry is, and what the
// area takes beyond its entries, such as its separator, so a page can leave room for the footnotes
// its blocks cite.

import type { Node as ProseMirrorNode } from 'prosemirror-model';

/** A footnote area's measurements, in CSS pixels. */
export interface FootnoteArea {
  /** The height the area takes beyond its entries, when it holds any. */
  readonly overhead: number;
  /** Each entry's height, with the space before the next, by footnote id. */
  readonly entries: ReadonlyMap<string, number>;
  /**
   * Each entry's height without the space before the next, by footnote id, which an area's last
   * entry takes; the height with the space where an entry has none.
   */
  readonly last?: ReadonlyMap<string, number> | undefined;
}

interface PlacedBox {
  readonly top: number;
  readonly bottom: number;
}

interface PlacedEntry extends PlacedBox {
  readonly id: string;
}

// The area's measurements from its entries' boxes and what it takes beyond them.
function areaOf(
  placed: readonly PlacedEntry[],
  overhead: (first: PlacedEntry, end: PlacedEntry) => number,
): FootnoteArea {
  const entries = new Map<string, number>();
  const last = new Map<string, number>();
  placed.forEach((entry, index) => {
    const next = placed[index + 1];
    const height = (next ? next.top : entry.bottom) - entry.top;
    if (entries.has(entry.id)) return;
    entries.set(entry.id, Math.max(0, height));
    last.set(entry.id, Math.max(0, entry.bottom - entry.top));
  });
  const [first, end] = [placed[0], placed.at(-1)];
  if (!first || !end) return { overhead: 0, entries, last };
  return { overhead: Math.max(0, overhead(first, end)), entries, last };
}

/**
 * A footnote area's measurements from where its entries sit and its height, as the layout engine
 * lays them out (`PagesTextEngine.measureRegion`).
 */
export function footnoteAreaOf(
  area: ProseMirrorNode,
  room: { readonly height: number; readonly children: readonly PlacedBox[] },
): FootnoteArea {
  const placed: PlacedEntry[] = [];
  area.forEach((entry, _offset, index) => {
    const id = entry.attrs.footnoteId as unknown;
    const box = room.children[index];
    if (box && typeof id === 'string' && id) placed.push({ id, ...box });
  });
  return areaOf(placed, (first, end) => room.height - (end.bottom - first.top));
}

/**
 * The height a footnote area takes holding the entries of some footnotes, in order: each with the
 * space before the next, but the last without it.
 */
export function footnoteAreaHeight(area: FootnoteArea, ids: Iterable<string>): number {
  let height = 0;
  let end: string | null = null;
  for (const id of ids) {
    const entry = area.entries.get(id);
    if (entry === undefined) continue;
    height += entry;
    end = id;
  }
  if (end === null || height <= 0) return 0;
  const space = (area.entries.get(end) ?? 0) - (area.last?.get(end) ?? area.entries.get(end) ?? 0);
  return Math.max(0, height - Math.max(0, space)) + area.overhead;
}
