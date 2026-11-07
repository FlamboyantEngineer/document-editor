// Measures a page's footnote area as an editor view laid it out: how tall each entry is, and what
// the area takes beyond its entries, such as its separator, so a page can leave room for the
// footnotes its blocks cite.

import type { EditorView } from 'prosemirror-view';

/** A footnote area's measurements, in CSS pixels. */
export interface FootnoteArea {
  /** The height the area takes beyond its entries, when it holds any. */
  readonly overhead: number;
  /** Each entry's height, with the space before the next, by footnote id. */
  readonly entries: ReadonlyMap<string, number>;
}

interface PlacedEntry {
  readonly id: string;
  readonly top: number;
  readonly bottom: number;
}

function placedEntries(view: EditorView, pos: number): PlacedEntry[] {
  const area = view.state.doc.nodeAt(pos);
  const placed: PlacedEntry[] = [];
  area?.forEach((entry, offset) => {
    const dom = view.nodeDOM(pos + 1 + offset);
    const id = entry.attrs.footnoteId as unknown;
    if (!dom || dom.nodeType !== 1 || typeof id !== 'string' || !id) return;
    const rect = (dom as HTMLElement).getBoundingClientRect();
    placed.push({ id, top: rect.top, bottom: rect.bottom });
  });
  return placed;
}

/** The footnote area at a position, measured; an area with no entries measures nothing. */
export function measureFootnotes(
  view: EditorView,
  pos: number,
  { scale = 1 }: { scale?: number | undefined } = {},
): FootnoteArea {
  const ratio = scale > 0 ? scale : 1;
  const placed = placedEntries(view, pos);
  const entries = new Map<string, number>();
  placed.forEach((entry, index) => {
    const next = placed[index + 1];
    const height = (next ? next.top : entry.bottom) - entry.top;
    if (!entries.has(entry.id)) entries.set(entry.id, Math.max(0, height) / ratio);
  });
  const first = placed[0];
  const last = placed.at(-1);
  const dom = view.nodeDOM(pos);
  if (!first || !last || !dom || dom.nodeType !== 1) return { overhead: 0, entries };
  const area = (dom as HTMLElement).getBoundingClientRect();
  return { overhead: Math.max(0, area.height - (last.bottom - first.top)) / ratio, entries };
}

/** The height a footnote area takes holding the entries of some footnotes. */
export function footnoteAreaHeight(area: FootnoteArea, ids: Iterable<string>): number {
  let height = 0;
  for (const id of ids) height += area.entries.get(id) ?? 0;
  return height > 0 ? height + area.overhead : 0;
}
