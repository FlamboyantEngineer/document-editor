// Lays a section's blocks out on pages again after a change, reusing what the change cannot reach:
// the pages before the first changed block, kept as they were, and, once a page after the change
// starts at the same unchanged block, in the same state, as a page did before, every page from
// there. A section whose blocks and inputs are all as they were reuses every page.

import { headingLevel, type LayoutBlock } from '../model/index.js';

/** A page laid out, with where it started, so a later layout can reuse it or start from it. */
interface PageRecord {
  readonly blocks: readonly LayoutBlock[];
  /** The index of the first of the section's blocks it holds whole or from its start. */
  readonly start: number;
  /** The fragments of an earlier block it started with, left by a split. */
  readonly head: readonly LayoutBlock[];
  /** The caller's state before it, such as which footnotes earlier pages showed. */
  readonly state: string;
}

/** A section as it was laid out, for the next layout of it. */
export interface SectionLayout {
  /** What else its pages depended on besides its blocks, such as its page height. */
  readonly key: string;
  readonly blocks: readonly LayoutBlock[];
  readonly pages: readonly PageRecord[];
}

/** How a section is laid out page by page, and what it was before. */
export interface IncrementalSection {
  readonly blocks: readonly LayoutBlock[];
  /** What else its pages depend on; a different key lays every page out again. */
  readonly key: string;
  readonly previous?: SectionLayout | undefined;
  /** Lays one page out from the front of the queue, removing what it places. */
  readonly next: (queue: LayoutBlock[], pageIndex: number) => LayoutBlock[];
  /** The caller's state before the next page, which a reused page must start in. */
  readonly state: () => string;
  /** Tells the caller of each page, laid out or reused, in order. */
  readonly page: (blocks: readonly LayoutBlock[]) => void;
}

/** A section laid out: its pages, the record for its next layout, and how many pages were new. */
export interface IncrementalResult {
  readonly pages: readonly (readonly LayoutBlock[])[];
  readonly layout: SectionLayout;
  readonly pagesLaidOut: number;
}

// The first index where two block lists differ, and how many blocks they end with alike.
function changedRange(before: readonly LayoutBlock[], after: readonly LayoutBlock[]) {
  const shorter = Math.min(before.length, after.length);
  let first = 0;
  while (first < shorter && before[first] === after[first]) first += 1;
  let same = 0;
  while (
    same < shorter - first &&
    before[before.length - 1 - same] === after[after.length - 1 - same]
  ) {
    same += 1;
  }
  return { first, same };
}

// The end of what a page that leaves `end` at the front of the queue read: that block, and the
// headings from there with the block they keep with, which decide whether a heading moves on. A
// page that left nothing read the section's end, past its last block.
function readsThrough(blocks: readonly LayoutBlock[], end: number): number {
  let index = end;
  while (index < blocks.length && headingLevel(blocks[index]?.node) !== null) index += 1;
  return index + 1;
}

// Where the queue stands among the section's blocks: the fragments at its front, and the index of
// the first block still whole in it.
function queueStart(queue: readonly LayoutBlock[], blocks: readonly LayoutBlock[]) {
  let fragments = 0;
  while (
    fragments < queue.length &&
    queue[fragments] !== blocks[blocks.length - (queue.length - fragments)]
  ) {
    fragments += 1;
  }
  return { head: queue.slice(0, fragments), start: blocks.length - (queue.length - fragments) };
}

// The pages a new layout keeps from the start: those that read no changed block.
function keptPrefix(previous: SectionLayout, first: number): number {
  const { pages, blocks } = previous;
  let kept = 0;
  while (kept < pages.length) {
    const end = pages[kept + 1]?.start ?? blocks.length;
    if (readsThrough(blocks, end) > first) break;
    kept += 1;
  }
  return kept;
}

// Where a new layout starts: the pages it keeps from the previous one, the queue after them, and
// where the blocks the change left alike at the end start, in the new blocks and from the old.
function resume(previous: SectionLayout | undefined, blocks: readonly LayoutBlock[]) {
  if (!previous) return { kept: [], queue: [...blocks], shift: 0, suffixFrom: blocks.length };
  const range = changedRange(previous.blocks, blocks);
  const unchanged = range.first === blocks.length && blocks.length === previous.blocks.length;
  const kept = keptPrefix(previous, unchanged ? Number.POSITIVE_INFINITY : range.first);
  const from = previous.pages[kept];
  return {
    kept: previous.pages.slice(0, kept),
    queue: from ? [...from.head, ...blocks.slice(from.start)] : [],
    shift: blocks.length - previous.blocks.length,
    suffixFrom: blocks.length - range.same,
  };
}

// Whether a page about to be laid out starts where an old page did, in the same state, in the
// blocks the change left alike, so every page from there is the old one.
function meetsOld(
  old: PageRecord | undefined,
  next: { readonly head: readonly LayoutBlock[]; readonly start: number; readonly state: string },
  place: { readonly shift: number; readonly suffixFrom: number },
): old is PageRecord {
  if (!old || next.head.length || old.head.length || next.start < place.suffixFrom) return false;
  return old.start + place.shift === next.start && old.state === next.state;
}

/** Lays a section out, reusing the pages of its previous layout that the change leaves alike. */
export function layoutSectionIncrementally(section: IncrementalSection): IncrementalResult {
  const { blocks, key } = section;
  const matches = section.previous?.key === key;
  const previous =
    matches && section.previous?.pages[0]?.state === section.state() ? section.previous : undefined;
  const records: PageRecord[] = [];
  const reuse = (record: PageRecord, start: number) => {
    records.push({ ...record, start });
    section.page(record.blocks);
  };
  const place = resume(previous, blocks);
  for (const record of place.kept) reuse(record, record.start);
  const { queue } = place;
  let laidOut = 0;
  while (queue.length) {
    const next = { ...queueStart(queue, blocks), state: section.state() };
    const old = previous?.pages[records.length];
    if (meetsOld(old, next, place)) {
      const rest = previous?.pages.slice(records.length) ?? [];
      for (const record of rest) reuse(record, record.start + place.shift);
      break;
    }
    const page = section.next(queue, records.length);
    records.push({ blocks: page, ...next });
    section.page(page);
    laidOut += 1;
  }
  return {
    pages: records.map((record) => record.blocks),
    layout: { key, blocks, pages: records },
    pagesLaidOut: laidOut,
  };
}
