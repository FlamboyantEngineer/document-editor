// Positions between a paged projection and its canonical whole document, through the mappings of
// the page transform that joins one into the other. Joining a section's pages moves every page's
// footnote entries onto the last page and drops the header rows a table continuation repeats, so
// positions inside them map nowhere through its steps. They are found again by footnote id and by
// row, at the same offset into the entry or the row.

import type { Node as ProseMirrorNode, ResolvedPos } from 'prosemirror-model';
import type { Mapping } from 'prosemirror-transform';
import { isHeaderRow } from '../model/index.js';
import { isTableHeaderCopy } from '../model/pagination/table-header-copies.js';
import { footnoteAt, footnoteCopies } from './footnote-positions.js';

/** Which way a position is mapped: from the paged projection to the canonical document, or back. */
export type MapDirection = 'toCanonical' | 'toProjection';

// Where row `row` of the table whose content starts at `start` starts.
function rowStart(table: ProseMirrorNode, start: number, row: number): number {
  let at = start;
  for (let index = 0; index < row; index += 1) at += table.child(index).nodeSize;
  return at;
}

// A position inside a header row a table continuation repeats: the row, the offset into it, and
// where the continuation's final body row starts.
function repeatedHeaderAt($pos: ResolvedPos) {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const table = $pos.node(depth);
    if (table.type.name !== 'table') continue;
    const part = table.attrs.splitPartIndex as unknown;
    if (typeof part !== 'number' || part < 1 || depth === $pos.depth) return null;
    const row = $pos.index(depth);
    const copy = table.maybeChild(row);
    const last = table.childCount - 1;
    if (!copy || !isHeaderRow(copy) || row >= last) return null;
    const start = $pos.start(depth);
    return {
      row,
      copy,
      offset: $pos.pos - rowStart(table, start, row),
      bodyStart: rowStart(table, start, last),
    };
  }
  return null;
}

// Row `row` in the table around `pos` and where it starts.
function rowAround(doc: ProseMirrorNode, pos: number, row: number) {
  const $pos = doc.resolve(pos);
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    const table = $pos.node(depth);
    if (table.type.name !== 'table') continue;
    const node = table.maybeChild(row);
    return node ? { node, start: rowStart(table, $pos.start(depth), row) } : null;
  }
  return null;
}

interface Redirect {
  readonly $pos: ResolvedPos;
  readonly to: ProseMirrorNode;
  readonly direction: MapDirection;
  /** Projection to canonical. */
  readonly forward: Mapping;
}

// A header row a table continuation repeats maps through its canonical row.
function redirectPosition({ $pos, to, direction, forward }: Redirect): number | null {
  if (direction !== 'toCanonical') return null;
  const header = repeatedHeaderAt($pos);
  if (!header) return null;
  const body = forward.mapResult(header.bodyStart + 1, 1);
  if (body.deletedAcross) return null;
  const original = rowAround(to, body.pos, header.row);
  if (!original) return null;
  // Legacy anonymous copies already removed by the join may have equal contents and distinct nodes.
  const same = isTableHeaderCopy(original.node, header.copy) || original.node.eq(header.copy);
  return same ? original.start + header.offset : null;
}

const PAGE_REGIONS = new Set(['page_header', 'page_footer']);

// A position in a page's header or footer: the region's depth, its section's depth and the page.
function regionAt($pos: ResolvedPos) {
  for (let depth = $pos.depth; depth > 1; depth -= 1) {
    if (!PAGE_REGIONS.has($pos.node(depth).type.name)) continue;
    const section = depth - 2;
    if ($pos.node(section).type.name !== 'page_section') return null;
    return { depth, section, page: $pos.index(section) };
  }
  return null;
}

// Where the content of the `name` region on page `page` of the section at depth `section` around
// `$pos` starts.
function regionContentStart(
  $pos: ResolvedPos,
  { section, page }: { readonly section: number; readonly page: number },
  name: string,
) {
  const pagePos = $pos.posAtIndex(page, section);
  let start: number | null = null;
  $pos
    .node(section)
    .child(page)
    .forEach((region, offset) => {
      if (region.type.name === name) start = pagePos + 1 + offset + 1;
    });
  return start;
}

// The same place in another page's copy of the region `$pos` is in: the same offset, kept inside.
function placeInCopy($pos: ResolvedPos, region: { depth: number; section: number }, page: number) {
  const name = $pos.node(region.depth).type.name;
  const start = regionContentStart($pos, { section: region.section, page }, name);
  if (start === null) return null;
  const size = $pos
    .node(region.section)
    .child(page)
    .child($pos.index(region.depth - 1)).content.size;
  return start + Math.min($pos.pos - $pos.start(region.depth), size);
}

/**
 * A position in a copy of a page header or footer that joining the pages drops, at the same place
 * in the copy the join keeps: the section's first page's header and its last page's footer
 * (DOCE-SECTIONS-5.1). Null for any other position.
 */
function keptRegionPlace($pos: ResolvedPos): number | null {
  const region = regionAt($pos);
  if (!region) return null;
  const pages = $pos.node(region.section).childCount;
  const kept = $pos.node(region.depth).type.name === 'page_header' ? 0 : pages - 1;
  return region.page === kept ? null : placeInCopy($pos, region, kept);
}

/**
 * A projection position as the same place in the copy of its page header or footer that `near` is
 * in, on another page of the same section; `pos` itself otherwise. A canonical position in a
 * header or footer maps to one copy, and the writer's place may be in another.
 */
export function regionCopyNear(doc: ProseMirrorNode, pos: number, near: number): number {
  const $pos = doc.resolve(pos);
  const $near = doc.resolve(near);
  const region = regionAt($pos);
  const other = regionAt($near);
  const same =
    region &&
    other &&
    region.page !== other.page &&
    $pos.before(region.section) === $near.before(other.section) &&
    $pos.node(region.depth).type === $near.node(other.depth).type;
  return same ? (placeInCopy($pos, region, other.page) ?? pos) : pos;
}

/**
 * Where the content of the header or footer `$pos` is in starts in `doc`, on the page of the same
 * index in the section of the same index, as a new layout of the same pages holds it; null when
 * `$pos` is in neither or `doc` has no such page.
 */
export function sameRegionIn($pos: ResolvedPos, doc: ProseMirrorNode): number | null {
  const region = regionAt($pos);
  if (!region || region.section !== 1) return null;
  const index = $pos.index(0);
  if (index >= doc.childCount || doc.child(index).type !== $pos.node(1).type) return null;
  const $section = doc.resolve(doc.resolve(0).posAtIndex(index) + 1);
  if (region.page >= $section.parent.childCount) return null;
  return regionContentStart(
    $section,
    { section: 1, page: region.page },
    $pos.node(region.depth).type.name,
  );
}

/** Two documents and the mappings between them: projection to canonical, and back. */
export interface PagePositions {
  readonly projection: ProseMirrorNode;
  readonly canonical: ProseMirrorNode;
  readonly forward: Mapping;
  readonly backward: Mapping;
}

/**
 * A position mapped from one document to the other, found again by footnote id or table row when
 * the mapping deleted it; null when it maps nowhere.
 */
export function mapPosition(
  positions: PagePositions,
  at: { readonly pos: number; readonly assoc: -1 | 1 },
  direction: MapDirection,
): number | null {
  const { projection, canonical, forward, backward } = positions;
  const toCanonical = direction === 'toCanonical';
  const [from, to] = toCanonical ? [projection, canonical] : [canonical, projection];
  const result = (toCanonical ? forward : backward).mapResult(at.pos, at.assoc);
  if (!result.deletedAcross) return result.pos;
  // Joining the pages keeps one entry per note. An occurrence the join drops still points at it.
  const $pos = from.resolve(at.pos);
  const entry = footnoteAt($pos);
  if (entry) {
    const [first] = footnoteCopies(to, entry.id);
    return first ? first.from + Math.min(entry.offset, first.size) : null;
  }
  const kept = toCanonical ? keptRegionPlace($pos) : null;
  if (kept !== null) return mapPosition(positions, { pos: kept, assoc: at.assoc }, direction);
  return redirectPosition({ $pos, to, direction, forward });
}

/** -1 at the end of a textblock, so the position keeps to the text before it; otherwise 1. */
export function textSide(doc: ProseMirrorNode, pos: number): -1 | 1 {
  const $pos = doc.resolve(pos);
  return $pos.parent.isTextblock && $pos.parentOffset === $pos.parent.content.size ? -1 : 1;
}
