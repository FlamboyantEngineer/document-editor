// The canonical order of a run's marks. ProseMirror keeps a mark set sorted by mark type, but marks
// of a type that does not exclude itself (comment anchors, suggested insertions and deletions)
// stay in the order they were added. Two people who add the same marks in another order would then
// hold documents that differ only in that order, so such marks are added in id order everywhere.

import {
  Fragment,
  type Mark,
  type MarkType,
  type Node as ProseMirrorNode,
} from 'prosemirror-model';
import type { Transform } from 'prosemirror-transform';

/** Whether a run can carry several marks of this type, as comment anchors and suggestions do. */
export function overlapsItself(type: MarkType): boolean {
  return !type.excludes(type);
}

function idOf(mark: Mark, name: 'dataId' | 'commentId'): string {
  const value: unknown = mark.attrs[name];
  return typeof value === 'string' ? value : '';
}

/**
 * Orders two marks of one type by id: their `dataId`, then their `commentId`, then their other
 * attributes, so any two different marks have one order.
 */
export function compareMarks(a: Mark, b: Mark): number {
  for (const name of ['dataId', 'commentId'] as const) {
    const [left, right] = [idOf(a, name), idOf(b, name)];
    if (left !== right) return left < right ? -1 : 1;
  }
  const [left, right] = [JSON.stringify(a.attrs), JSON.stringify(b.attrs)];
  return left === right ? 0 : left < right ? -1 : 1;
}

// Whether `b` may follow `a` in a mark set that ProseMirror already sorted by type.
function follows(a: Mark | undefined, b: Mark): boolean {
  return a?.type !== b.type || !overlapsItself(b.type) || compareMarks(a, b) <= 0;
}

/**
 * A mark set in canonical order; the same array when it is in order already. The set is one
 * ProseMirror built (`Mark.setFrom`, a node's marks), which keeps marks sorted by type, so only
 * marks of one type that overlaps itself are sorted, by `compareMarks`.
 */
export function orderMarks(marks: readonly Mark[]): readonly Mark[] {
  if (marks.every((mark, index) => follows(marks[index - 1], mark))) return marks;
  const ordered: Mark[] = [];
  for (let start = 0; start < marks.length;) {
    const type = marks[start]?.type;
    let end = start + 1;
    while (end < marks.length && marks[end]?.type === type) end += 1;
    ordered.push(...marks.slice(start, end).sort(compareMarks));
    start = end;
  }
  return ordered;
}

/** A document whose every run's marks are in canonical order; the same node when they are. */
export function orderDocumentMarks(doc: ProseMirrorNode): ProseMirrorNode {
  if (doc.isLeaf) {
    const marks = orderMarks(doc.marks);
    return marks === doc.marks ? doc : doc.mark(marks);
  }
  let changed = false;
  const children: ProseMirrorNode[] = [];
  doc.forEach((child) => {
    const ordered = orderDocumentMarks(child);
    if (ordered !== child) changed = true;
    children.push(ordered);
  });
  // An inline node that holds content, such as inline math, has marks of its own too.
  const marks = doc.isInline ? orderMarks(doc.marks) : doc.marks;
  if (!changed && marks === doc.marks) return doc;
  // Appending joins neighbouring runs whose marks are now the same.
  const copy = changed
    ? doc.copy(
        children.reduce((content, child) => content.append(Fragment.from(child)), Fragment.empty),
      )
    : doc;
  return marks === doc.marks ? copy : copy.mark(marks);
}

/**
 * Adds `mark` from `from` to `to` so every run there keeps its marks in canonical order: marks of
 * the same type that sort after it are taken off, and put back after it.
 */
export function addMarkInOrder<T extends Transform>(
  tr: T,
  { from, to }: { readonly from: number; readonly to: number },
  mark: Mark,
): T {
  if (!overlapsItself(mark.type)) return tr.addMark(from, to, mark);
  const later: { from: number; to: number; mark: Mark }[] = [];
  tr.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isInline) return true;
    for (const other of node.marks) {
      if (other.type !== mark.type || compareMarks(other, mark) <= 0) continue;
      later.push({ from: Math.max(from, pos), to: Math.min(to, pos + node.nodeSize), mark: other });
    }
    return false;
  });
  for (const run of later) tr.removeMark(run.from, run.to, run.mark);
  tr.addMark(from, to, mark);
  later.sort((a, b) => compareMarks(a.mark, b.mark));
  for (const run of later) tr.addMark(run.from, run.to, run.mark);
  return tr;
}
