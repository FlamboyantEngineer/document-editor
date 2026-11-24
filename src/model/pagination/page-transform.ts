// Pages and their whole document as steps. Joining a section's pages into one, with the fragments
// that meet joined, is a transform; so is the way back, as that transform's steps inverted. Moving
// from one page layout to another therefore runs through ordinary steps, and a selection, the undo
// history and remote positions map through it without any code of their own.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { Transform } from 'prosemirror-transform';
import {
  continuesFragment,
  FRAGMENT_RULES,
  type FragmentRules,
  isFragment,
  joinAt,
  joinBlocks,
  makeWhole,
} from './fragments.js';

/** Which of a section's pages join, by index; by default all of them. */
export interface PageJoinOptions {
  from?: number | undefined;
  to?: number | undefined;
  rules?: FragmentRules | undefined;
}

function childStarts(node: ProseMirrorNode, pos: number): number[] {
  const starts: number[] = [];
  node.forEach((_child, offset) => starts.push(pos + 1 + offset));
  return starts;
}

// Where a page's regions start, by type name.
function regionStarts(page: ProseMirrorNode, pagePos: number): Map<string, number> {
  const starts = new Map<string, number>();
  page.forEach((region, offset) => starts.set(region.type.name, pagePos + 1 + offset));
  return starts;
}

function pageAt(tr: Transform, sectionPos: number, index: number) {
  const section = tr.doc.nodeAt(sectionPos);
  const pos = section ? childStarts(section, sectionPos)[index] : undefined;
  const page = pos === undefined ? null : tr.doc.nodeAt(pos);
  return page && pos !== undefined ? { page, pos } : null;
}

// Moves page `index`'s content and footnotes onto the end of the page before it, which keeps its
// own header and the later page's footer. Gives where the two pages' blocks now meet, or null.
function mergeIntoPrevious(tr: Transform, sectionPos: number, index: number): number | null {
  const before = pageAt(tr, sectionPos, index - 1);
  const after = pageAt(tr, sectionPos, index);
  if (!before || !after) return null;
  const beforeRegions = regionStarts(before.page, before.pos);
  const afterRegions = regionStarts(after.page, after.pos);
  const content = beforeRegions.get('page_content');
  const notes = beforeRegions.get('page_footnotes');
  const nextNotes = afterRegions.get('page_footnotes');
  const nextContent = afterRegions.get('page_content');
  if (content === undefined || notes === undefined) return null;
  if (nextNotes === undefined || nextContent === undefined) return null;
  // The later page's footnotes come after its content, so copying the entries there first moves
  // nothing the deletion reaches.
  const entries = tr.doc.nodeAt(notes)?.content;
  if (entries?.size) tr.insert(nextNotes + 1, entries);
  const contentEnd = content + (tr.doc.nodeAt(content)?.nodeSize ?? 2) - 1;
  tr.delete(contentEnd, nextContent + 1);
  return contentEnd;
}

// The pages from `from` through `last` join in pairs, round after round, so each block is copied
// into a joined page a number of times that grows with the log of the pages rather than with the
// pages. Within a round the later pairs join first, so the earlier pages stay put. Each merge is
// told where the two pages' blocks meet, by the index the later one's first page had before any
// merge; false stops the rounds.
function mergePages(
  tr: Transform,
  sectionPos: number,
  {
    from,
    last,
    merged,
  }: { from: number; last: number; merged?: (index: number, seam: number) => void },
): boolean {
  // By the pages as they now are, the index of each one's first page before the rounds.
  const firsts = Array.from({ length: last - from + 1 }, (_, offset) => from + offset);
  for (let count = firsts.length; count > 1; count = Math.ceil(count / 2)) {
    for (let offset = count % 2 === 0 ? count - 1 : count - 2; offset >= 1; offset -= 2) {
      const seam = mergeIntoPrevious(tr, sectionPos, from + offset);
      if (seam === null) return false;
      merged?.(firsts[offset] ?? from + offset, seam);
      firsts.splice(offset, 1);
    }
  }
  return true;
}

function contentOf(page: ProseMirrorNode): ProseMirrorNode | null {
  let content: ProseMirrorNode | null = null;
  page.forEach((region) => {
    if (region.type.name === 'page_content') content ??= region;
  });
  return content;
}

// A block of the joining pages: where it starts before any step, and whether it continues the
// block before it, on the page before.
interface PlannedBlock {
  readonly pos: number;
  readonly node: ProseMirrorNode;
  readonly continues: boolean;
}

// How the joining pages' blocks join, read before any step: for each page after the first, whether
// its first block continues the block before it, and where each block starts. Null when a page has
// no blocks or two blocks of one page continue each other, which the joins block by block take.
interface SeamPlan {
  /** By page index: whether its first block continues the previous page's last. */
  readonly continues: ReadonlyMap<number, boolean>;
  /** By page index: how many blocks it holds. */
  readonly counts: ReadonlyMap<number, number>;
  readonly blocks: readonly PlannedBlock[];
}

function seamPlan(
  section: ProseMirrorNode,
  {
    sectionPos,
    from,
    last,
    rules,
  }: { sectionPos: number; from: number; last: number; rules: FragmentRules },
): SeamPlan | null {
  const continues = new Map<number, boolean>();
  const counts = new Map<number, number>();
  const blocks: PlannedBlock[] = [];
  let previous: ProseMirrorNode | null = null;
  let planned = true;
  section.forEach((page, pageOffset, index) => {
    if (!planned || index < from || index > last) return;
    const content = contentOf(page);
    if (!content?.childCount) {
      planned = false;
      return;
    }
    counts.set(index, content.childCount);
    let contentPos = sectionPos + 1 + pageOffset + 1;
    page.forEach((region, offset) => {
      if (region === content) contentPos += offset;
    });
    content.forEach((block, offset, at) => {
      const continued = previous !== null && continuesFragment(previous, block, rules);
      if (at === 0 && index > from) continues.set(index, continued);
      else if (continued) planned = false;
      blocks.push({ pos: contentPos + 1 + offset, node: block, continues: continued });
      previous = block;
    });
  });
  return planned ? { continues, counts, blocks } : null;
}

// Joins the pages and their fragments as they meet: a block made of fragments is joined from its
// first page on, so each join meets the next fragment as the page split it. A page whose one block
// continues on both sides holds back the join after it until the rounds are done, since by then the
// later fragment would already have taken the one after it.
function joinPagesAtSeams(
  tr: Transform,
  sectionPos: number,
  { from, last, rules, plan }: { from: number; last: number; rules: FragmentRules; plan: SeamPlan },
) {
  const { continues } = plan;
  // Each block that continues nothing takes its whole attributes, as the joins block by block give
  // them; the rest join into the ones they continue. Attribute steps move no position.
  for (const block of plan.blocks) {
    if (!block.continues && isFragment(block.node, rules)) makeWhole(tr, block.pos, rules);
  }
  const held: { index: number; seam: number; steps: number }[] = [];
  const holds = (index: number) =>
    continues.get(index - 1) === true && plan.counts.get(index - 1) === 1;
  const merged = (index: number, seam: number) => {
    if (!continues.get(index)) return;
    if (holds(index)) held.push({ index, seam, steps: tr.steps.length });
    else joinAt(tr, seam, rules);
  };
  if (!mergePages(tr, sectionPos, { from, last, merged })) return;
  held.sort((left, right) => left.index - right.index);
  for (const { seam, steps } of held) joinAt(tr, tr.mapping.slice(steps).map(seam), rules);
}

/**
 * Joins a section's pages from `from` through `to` into the first of them, its header with the last
 * one's footer and every page's footnotes, and then the fragments that meet in its content.
 */
export function joinSectionPages(
  tr: Transform,
  sectionPos: number,
  { from = 0, to, rules = FRAGMENT_RULES }: PageJoinOptions = {},
): void {
  const section = tr.doc.nodeAt(sectionPos);
  if (section?.type.name !== 'page_section') return;
  const last = Math.min(to ?? section.childCount - 1, section.childCount - 1);
  const plan = seamPlan(section, { sectionPos, from, last, rules });
  if (plan) {
    joinPagesAtSeams(tr, sectionPos, { from, last, rules, plan });
    return;
  }
  if (!mergePages(tr, sectionPos, { from, last })) return;
  const page = pageAt(tr, sectionPos, from);
  const contentPos = page ? regionStarts(page.page, page.pos).get('page_content') : undefined;
  if (contentPos === undefined) return;
  joinBlocks(
    tr,
    { from: contentPos + 1, blocks: tr.doc.nodeAt(contentPos)?.children ?? [] },
    rules,
  );
}

/**
 * A paged document as its whole document, each section on one page with whole blocks, as the
 * transform that makes it: its `doc` is the whole document and its `mapping` maps positions there.
 */
export function joinDocumentPages(
  doc: ProseMirrorNode,
  rules: FragmentRules = FRAGMENT_RULES,
): Transform {
  const tr = new Transform(doc);
  const sections: number[] = [];
  doc.forEach((child, offset) => {
    if (child.type.name === 'page_section') sections.push(offset);
  });
  // Later sections first, so the earlier ones' positions stay put.
  for (const pos of sections.reverse()) joinSectionPages(tr, pos, { rules });
  return tr;
}
