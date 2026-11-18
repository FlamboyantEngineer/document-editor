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

// Whether a range covers a whole table, which cannot be suggested as a block (DOCE-SUGGESTIONS-1.5).
export function coversTable(doc: ProseMirrorNode, [from, to]: readonly [number, number]) {
  let covers = false;
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name === 'table_figure' && pos >= from && pos + node.nodeSize <= to)
      covers = true;
    return !covers;
  });
  return covers;
}
