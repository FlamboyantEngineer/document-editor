// Whole objects while suggesting: a figure or layout section a deletion covers is suggested for
// deletion as one block, named the writer's by the deletion marks on its text.

import type { Node as ProseMirrorNode } from 'prosemirror-model';

/** Whether a block can be suggested whole, as it has the suggestion attributes. */
export const hasKindAttrs = (node: ProseMirrorNode) =>
  Object.hasOwn(node.type.spec.attrs ?? {}, 'suggestionSplitKind');

// The blocks a range covers whole that a suggestion deletes as blocks, outermost first: a figure or
// a layout section, which a reader accepts or rejects whole rather than leaving it empty.
export function wholeBlocks(doc: ProseMirrorNode, [from, to]: readonly [number, number]) {
  const blocks: { node: ProseMirrorNode; pos: number }[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.isTextblock || !hasKindAttrs(node)) return true;
    if (pos < from || pos + node.nodeSize > to) return true;
    blocks.push({ node, pos });
    return false;
  });
  return blocks;
}

// Whether a deletion would mark some text of a block as the writer's: text that is neither the
// writer's own suggested insertion, which goes outright, nor already suggested for deletion.
function hasWritersMark(block: ProseMirrorNode, author: string | null): boolean {
  let marked = false;
  block.descendants((node) => {
    if (marked || !node.isText) return !marked;
    const kinds = node.marks.map((mark) => mark.type.name);
    const own = node.marks.some(
      (mark) => mark.type.name === 'insertion' && mark.attrs.dataAuthor === author,
    );
    marked = !own && !kinds.includes('deletion');
    return !marked;
  });
  return marked;
}

/**
 * Whether a deletion of a range cannot be suggested: it covers a whole figure or layout section
 * none of whose text would take the writer's deletion mark, which names the block's suggestion as
 * theirs (DOCE-SUGGESTIONS-1.4), unless it is the writer's own suggested block. A table, which
 * cannot be a suggested block, has its text suggested for deletion instead.
 */
export function cannotSuggestDeleting(
  doc: ProseMirrorNode,
  [from, to]: readonly [number, number],
  author: string | null,
): boolean {
  let refused = false;
  doc.nodesBetween(from, to, (node, pos) => {
    if (pos < from || pos + node.nodeSize > to) return !refused;
    if (!node.isTextblock && hasKindAttrs(node)) {
      const own =
        node.attrs.suggestionSplitKind === 'insertion' && node.attrs.dataAuthor === author;
      if (!own && !node.attrs.suggestionSplitKind && !hasWritersMark(node, author)) refused = true;
      return false;
    }
    return !refused;
  });
  return refused;
}
