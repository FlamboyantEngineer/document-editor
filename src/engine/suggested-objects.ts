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

// Whether a text takes the writer's deletion mark: it is neither the writer's own suggested
// insertion, which goes outright, nor already suggested for deletion.
const takesWritersMark = (node: ProseMirrorNode, author: string | null) =>
  node.isText &&
  !node.marks.some(
    (mark) =>
      mark.type.name === 'deletion' ||
      (mark.type.name === 'insertion' && mark.attrs.dataAuthor === author),
  );

const isOwnBlock = (node: ProseMirrorNode, author: string | null) =>
  node.attrs.suggestionSplitKind === 'insertion' && node.attrs.dataAuthor === author;

/**
 * Whether a deletion of a range cannot be suggested: it covers a whole figure or layout section,
 * not the writer's own suggested block, and no text in the range takes the writer's deletion mark,
 * which names the suggestion the block joins as theirs (DOCE-SUGGESTIONS-1.4). A table, which
 * cannot be a suggested block, has its text suggested for deletion instead.
 */
export function cannotSuggestDeleting(
  doc: ProseMirrorNode,
  [from, to]: readonly [number, number],
  author: string | null,
): boolean {
  let block = false;
  let named = false;
  doc.nodesBetween(from, to, (node, pos) => {
    const whole = pos >= from && pos + node.nodeSize <= to;
    if (whole && !node.isTextblock && hasKindAttrs(node)) {
      // The writer's own block goes outright, its text with it.
      if (isOwnBlock(node, author)) return false;
      if (!node.attrs.suggestionSplitKind) block = true;
    }
    if (takesWritersMark(node, author)) named = true;
    return true;
  });
  return block && !named;
}
