// Whether a document holds a list of contents, found again only below the nodes an edit replaced,
// so a document with none skips its catalog on each keystroke.

import type { Node as ProseMirrorNode } from 'prosemirror-model';

// Whether each node holds a list of contents, kept for as long as the node is.
const holdsContents = new WeakMap<ProseMirrorNode, boolean>();

/** Whether a node is or holds a list of contents (`toc_block`). */
export function hasContents(node: ProseMirrorNode): boolean {
  if (node.type.name === 'toc_block') return true;
  if (node.isTextblock || node.isLeaf) return false;
  let held = holdsContents.get(node);
  if (held === undefined) {
    held = false;
    node.forEach((child) => {
      held ||= hasContents(child);
    });
    holdsContents.set(node, held);
  }
  return held;
}
