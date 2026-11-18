// Whole objects while suggesting: a figure or layout section a deletion covers is suggested for
// deletion as one block, and a table, which cannot be a suggested block, is refused whole.

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

/**
 * Whether a deletion of a range cannot be suggested: it covers a whole table, which cannot be a
 * suggested block (DOCE-SUGGESTIONS-1.5), or a whole figure or layout section with no text, which
 * its writer's marks could not name as theirs, unless it is the writer's own suggested block.
 */
export function cannotSuggestDeleting(
  doc: ProseMirrorNode,
  [from, to]: readonly [number, number],
  author: string | null,
): boolean {
  let refused = false;
  doc.nodesBetween(from, to, (node, pos) => {
    if (pos < from || pos + node.nodeSize > to) return !refused;
    if (node.type.name === 'table_figure') refused = true;
    else if (!node.isTextblock && hasKindAttrs(node) && !node.textContent) {
      const own =
        node.attrs.suggestionSplitKind === 'insertion' && node.attrs.dataAuthor === author;
      if (!own) refused = true;
    }
    return !refused;
  });
  return refused;
}
