// The room a section's page header and footer take on each page, and its footnote area. A header
// or footer showing the page's number or the page count takes the room its text takes on that
// page: `Page 9` and `Page 10` can wrap differently (DOCE-PAGINATION-11.10).

import type { EditorState } from 'prosemirror-state';
import { type FootnoteArea, footnoteAreaOf } from './footnote-area.js';
import { regionVariableTexts } from './forced-regions.js';
import { pageVariablesKey } from './page-variables.js';
import type { PagesTextEngine } from './text-engine-types.js';

/** Where a section's regions are laid out: by the layout engine, in a scope. */
interface RegionAt {
  readonly scope: string | null;
  readonly engine: PagesTextEngine;
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

// The room a page header or footer takes, with its margins, on each page; an empty one takes none.
// The layout engine gives it as it lays the region out (`measureRegion`), with the texts its
// template variables show (`createPageVariables`) and the page's own number and count where it
// shows them; one it cannot lay out takes none. Nothing drawn is read.
function regionRoom(state: EditorState, pos: number | null, at: RegionAt): RegionRoomOf {
  const node = pos === null ? null : state.doc.nodeAt(pos);
  if (pos === null || !node) return fixed(0);
  const { engine, scope } = at;
  const texts = new Map(regionVariableTexts(node, pos, pageVariablesKey.getState(state)));
  const first = engine.measureRegion(node, scope, texts);
  if (!first) return fixed(0);
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

/** The room a section's header and footer, at their positions in the state laid out, take on each page. */
export function sectionRegions(
  state: EditorState,
  at: RegionAt,
  positions: { readonly header: number | null; readonly footer: number | null },
): SectionRegions {
  const header = regionRoom(state, positions.header, at);
  const footer = regionRoom(state, positions.footer, at);
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

/** A section's footnote area, laid out by the layout engine; none when it cannot lay it out. */
export function footnoteArea(
  state: EditorState,
  pos: number | null,
  at: RegionAt,
): FootnoteArea | null {
  if (pos === null) return null;
  const node = state.doc.nodeAt(pos);
  const room = node ? at.engine.measureRegion(node, at.scope) : null;
  return node && room ? footnoteAreaOf(node, room) : null;
}
