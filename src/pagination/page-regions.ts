// The room a section's page header and footer take on each page, and its footnote area. A header
// or footer showing the page's number or the page count takes the room its text takes on that
// page: `Page 9` and `Page 10` can wrap differently (DOCE-PAGINATION-11.10).

import type { EditorView } from 'prosemirror-view';
import { blockMargin } from './measure-cache.js';
import { type FootnoteArea, footnoteAreaOf, measureFootnotes } from './measure-footnotes.js';
import { unzoom } from './measure-scale.js';
import type { PagesTextEngine } from './text-engine-types.js';

/** Where a section's regions are measured: at the view's scale, or by the layout engine in a scope. */
interface RegionAt {
  readonly ratio: number;
  readonly scope: string | null;
  readonly engine: PagesTextEngine | null | undefined;
}

/** Which page numbers a section's regions show, so its pages depend on them. */
interface RegionReads {
  /** The page's own number (`page.current`). */
  readonly current: boolean;
  /** The document's page count (`page.total`). */
  readonly total: boolean;
}

/** The room a section's header and footer take on each page. */
export interface SectionRegions {
  /** On the page of a number, counted through the document from 1, among a count of pages. */
  on(page: number, pages: number): { readonly header: number; readonly footer: number };
  readonly reads: RegionReads;
}

interface RegionRoomOf {
  readonly room: (page: number, pages: number) => number;
  readonly reads: RegionReads;
}

const PAGE_CURRENT = 'page.current';
const PAGE_TOTAL = 'page.total';
const READS_NONE: RegionReads = { current: false, total: false };

const fixed = (height: number): RegionRoomOf => ({ room: () => height, reads: READS_NONE });

// The text each template variable in a header or footer shows, as the view draws it
// (`createPageVariables`): the engine lays the region out with these values.
function variableTexts(region: HTMLElement): Map<string, string> {
  const texts = new Map<string, string>();
  for (const variable of region.querySelectorAll<HTMLElement>('[data-template-variable]')) {
    texts.set(variable.dataset.templateVariable ?? '', variable.textContent);
  }
  return texts;
}

// The room the view's box of a region takes, with its margins.
function viewRoom(element: HTMLElement, height: number, ratio: number): number {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (!style) return unzoom(height, ratio);
  const margins =
    (parseFloat(blockMargin(style, 'start')) || 0) + (parseFloat(blockMargin(style, 'end')) || 0);
  return unzoom(height, ratio) + margins;
}

// The room a page header or footer takes, with its margins, on each page; one the view hides takes
// none. The layout engine gives it when it lays the region out (`measureRegion`), with the page's
// own number and count where it shows them; the view's box otherwise, the same on every page.
function regionRoom(view: EditorView, pos: number | null, at: RegionAt): RegionRoomOf {
  const dom = pos === null ? null : view.nodeDOM(pos);
  if (!dom || dom.nodeType !== 1) return fixed(0);
  const element = dom as HTMLElement;
  const { height } = element.getBoundingClientRect();
  if (!height) return fixed(0);
  const node = pos === null ? null : view.state.doc.nodeAt(pos);
  const { engine, scope } = at;
  const texts = variableTexts(element);
  const first = node && engine ? engine.measureRegion(node, scope, texts) : null;
  if (!node || !engine || !first) return fixed(viewRoom(element, height, at.ratio));
  const reads = { current: texts.has(PAGE_CURRENT), total: texts.has(PAGE_TOTAL) };
  const roomOf = (room: typeof first) => (room.height > 0 ? room.height + room.gap : 0);
  if (!reads.current && !reads.total) return fixed(roomOf(first));
  return {
    reads,
    room(page, pages) {
      const shown = new Map(texts);
      if (reads.current) shown.set(PAGE_CURRENT, String(page));
      if (reads.total) shown.set(PAGE_TOTAL, String(pages));
      const room = engine.measureRegion(node, scope, shown);
      return room ? roomOf(room) : roomOf(first);
    },
  };
}

/** The room a section's header and footer, at their positions in the view, take on each page. */
export function sectionRegions(
  view: EditorView,
  at: RegionAt,
  positions: { readonly header: number | null; readonly footer: number | null },
): SectionRegions {
  const header = regionRoom(view, positions.header, at);
  const footer = regionRoom(view, positions.footer, at);
  return {
    on: (page, pages) => ({ header: header.room(page, pages), footer: footer.room(page, pages) }),
    reads: {
      current: header.reads.current || footer.reads.current,
      total: header.reads.total || footer.reads.total,
    },
  };
}

/** The room a section's regions take on a page under several page counts: the most of each. */
export function roomsFor(regions: SectionRegions, page: number, counts: readonly number[]) {
  let header = 0;
  let footer = 0;
  for (const count of counts) {
    const room = regions.on(page, count);
    header = Math.max(header, room.header);
    footer = Math.max(footer, room.footer);
  }
  return { header, footer };
}

/** A section's footnote area, laid out by the layout engine when it can, else measured in the view. */
export function footnoteArea(
  view: EditorView,
  pos: number | null,
  at: RegionAt,
): FootnoteArea | null {
  if (pos === null) return null;
  const node = view.state.doc.nodeAt(pos);
  const room = node ? at.engine?.measureRegion(node, at.scope) : null;
  if (node && room) return footnoteAreaOf(node, room);
  return measureFootnotes(view, pos, { scale: at.ratio });
}
