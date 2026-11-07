// Moves a paged document onto another page layout of the same content by steps: the pages that
// differ are joined, then split again the target's way, as the target's own join inverted. Text
// keeps its positions through those steps, so the selection and the undo history follow it.

import { Mark, type Node as ProseMirrorNode } from 'prosemirror-model';
import { Transform } from 'prosemirror-transform';
import { FRAGMENT_RULES, type FragmentRules } from './fragments.js';
import { joinSectionPages } from './page-transform.js';

function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Whether two nodes have the same types, text and marks throughout, whatever their attributes. */
export function sameStructure(left: ProseMirrorNode, right: ProseMirrorNode): boolean {
  if (left === right) return true;
  if (left.type !== right.type || !Mark.sameSet(left.marks, right.marks)) return false;
  if (left.isText) return left.text === right.text;
  if (left.childCount !== right.childCount) return false;
  for (let index = 0; index < left.childCount; index += 1) {
    if (!sameStructure(left.child(index), right.child(index))) return false;
  }
  return true;
}

// Gives the node at `pos` and its descendants the attributes of `target`'s, which has its structure.
function copyAttrs(tr: Transform, pos: number, target: ProseMirrorNode) {
  const node = tr.doc.nodeAt(pos);
  if (!node || node === target || node.isText) return;
  for (const [name, value] of Object.entries(target.attrs)) {
    if (!sameValue(node.attrs[name], value)) tr.setNodeAttribute(pos, name, value);
  }
  node.forEach((_child, offset, index) => copyAttrs(tr, pos + 1 + offset, target.child(index)));
}

// A repagination in progress: the transform, the document it moves onto, and the fragment rules.
interface Repagination {
  readonly tr: Transform;
  readonly target: ProseMirrorNode;
  readonly rules: FragmentRules;
}

interface PageRange {
  from: number;
  /** The last differing page in the document. */
  to: number;
  /** The last differing page in the target. */
  targetTo: number;
}

function pagesOf(section: ProseMirrorNode): ProseMirrorNode[] {
  const pages: ProseMirrorNode[] = [];
  section.forEach((page) => pages.push(page));
  return pages;
}

// The pages between the ones both sections begin and end with alike; null when every page is.
function differingPages(section: ProseMirrorNode, target: ProseMirrorNode): PageRange | null {
  const pages = pagesOf(section);
  const targetPages = pagesOf(target);
  const last = pages.length - 1;
  const targetLast = targetPages.length - 1;
  let from = 0;
  while (from <= last && from <= targetLast) {
    const page = pages[from];
    const targetPage = targetPages[from];
    if (!page || !targetPage || !sameStructure(page, targetPage)) break;
    from += 1;
  }
  if (from > last && from > targetLast) return null;
  from = Math.max(0, Math.min(from, last, targetLast));
  let tail = 0;
  while (last - tail > from && targetLast - tail > from) {
    const page = pages[last - tail];
    const targetPage = targetPages[targetLast - tail];
    if (!page || !targetPage || !sameStructure(page, targetPage)) break;
    tail += 1;
  }
  return { from, to: last - tail, targetTo: targetLast - tail };
}

function replaceNode(tr: Transform, pos: number, target: ProseMirrorNode) {
  const node = tr.doc.nodeAt(pos);
  if (node) tr.replaceWith(pos, pos + node.nodeSize, target);
}

// Joins the differing pages in both, matches attributes, and replays the target's join backwards.
function resplit({ tr, target, rules }: Repagination, pos: number) {
  const section = tr.doc.nodeAt(pos);
  const targetSection = target.nodeAt(pos);
  const range = section && targetSection ? differingPages(section, targetSection) : null;
  if (!section || !targetSection || !range) return Boolean(section && targetSection);
  const scratch = new Transform(target);
  joinSectionPages(scratch, pos, { from: range.from, to: range.targetTo, rules });
  joinSectionPages(tr, pos, { from: range.from, to: range.to, rules });
  const joined = tr.doc.nodeAt(pos);
  const targetJoined = scratch.doc.nodeAt(pos);
  if (!joined || !targetJoined || !sameStructure(joined, targetJoined)) return false;
  copyAttrs(tr, pos, targetJoined);
  for (let index = scratch.steps.length - 1; index >= 0; index -= 1) {
    const step = scratch.steps[index];
    const doc = scratch.docs[index];
    if (!step || !doc || tr.maybeStep(step.invert(doc)).failed) return false;
  }
  return true;
}

function repaginateSection(job: Repagination, pos: number) {
  const { tr } = job;
  const section = tr.doc.nodeAt(pos);
  const targetSection = job.target.nodeAt(pos);
  if (!section || !targetSection || section.eq(targetSection)) return;
  if (!resplit(job, pos)) return replaceNode(tr, pos, targetSection);
  const result = tr.doc.nodeAt(pos);
  if (result && sameStructure(result, targetSection)) copyAttrs(tr, pos, targetSection);
  if (!tr.doc.nodeAt(pos)?.eq(targetSection)) replaceNode(tr, pos, targetSection);
}

/**
 * Steps the transform's document onto `target`, the same content laid out on other pages: each
 * section's differing pages are joined and split again the target's way, so positions in their text
 * map onto the same text. What cannot be reached that way is replaced, section by section.
 */
export function repaginate(
  tr: Transform,
  target: ProseMirrorNode,
  rules: FragmentRules = FRAGMENT_RULES,
): void {
  if (tr.doc.childCount !== target.childCount) {
    tr.replaceWith(0, tr.doc.content.size, target.content);
    return;
  }
  // Each child is made equal before the next, so a child sits at its target offset in both.
  target.forEach((child, offset, index) => {
    const node = tr.doc.child(index);
    if (node.type.name === 'page_section' && child.type.name === 'page_section') {
      repaginateSection({ tr, target, rules }, offset);
    } else if (!node.eq(child)) {
      replaceNode(tr, offset, child);
    }
  });
}
