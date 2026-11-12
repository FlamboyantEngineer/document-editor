// Pages and their whole document as steps. Joining a section's pages into one, with the fragments
// that meet joined, is a transform; so is the way back, as that transform's steps inverted. Moving
// from one page layout to another therefore runs through ordinary steps, and a selection, the undo
// history and remote positions map through it without any code of their own.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { Transform } from 'prosemirror-transform';
import { FRAGMENT_RULES, type FragmentRules, joinBlocks } from './fragments.js';

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
// own header and the later page's footer.
function mergeIntoPrevious(tr: Transform, sectionPos: number, index: number): boolean {
  const before = pageAt(tr, sectionPos, index - 1);
  const after = pageAt(tr, sectionPos, index);
  if (!before || !after) return false;
  const beforeRegions = regionStarts(before.page, before.pos);
  const afterRegions = regionStarts(after.page, after.pos);
  const content = beforeRegions.get('page_content');
  const notes = beforeRegions.get('page_footnotes');
  const nextNotes = afterRegions.get('page_footnotes');
  const nextContent = afterRegions.get('page_content');
  if (content === undefined || notes === undefined) return false;
  if (nextNotes === undefined || nextContent === undefined) return false;
  // The later page's footnotes come after its content, so copying the entries there first moves
  // nothing the deletion reaches.
  const entries = tr.doc.nodeAt(notes)?.content;
  if (entries?.size) tr.insert(nextNotes + 1, entries);
  const contentEnd = content + (tr.doc.nodeAt(content)?.nodeSize ?? 2) - 1;
  tr.delete(contentEnd, nextContent + 1);
  return true;
}

function children(node: ProseMirrorNode | null | undefined): ProseMirrorNode[] {
  const nodes: ProseMirrorNode[] = [];
  node?.forEach((child) => nodes.push(child));
  return nodes;
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
  // Pages join in pairs, round after round, so each block is copied into a joined page a number of
  // times that grows with the log of the pages rather than with the pages. Within a round the later
  // pairs join first, so the earlier pages stay put.
  for (let count = last - from + 1; count > 1; count = Math.ceil(count / 2)) {
    for (let offset = count % 2 === 0 ? count - 1 : count - 2; offset >= 1; offset -= 2) {
      if (!mergeIntoPrevious(tr, sectionPos, from + offset)) return;
    }
  }
  const page = pageAt(tr, sectionPos, from);
  const contentPos = page ? regionStarts(page.page, page.pos).get('page_content') : undefined;
  if (contentPos === undefined) return;
  joinBlocks(tr, { from: contentPos + 1, blocks: children(tr.doc.nodeAt(contentPos)) }, rules);
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
