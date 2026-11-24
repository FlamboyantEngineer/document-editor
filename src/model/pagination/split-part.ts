// Which part of a split block a node is, from its `splitPartIndex`.

import type { Node as ProseMirrorNode } from 'prosemirror-model';

/** The node's part number, from 0, or null for a node that is not a part of a split block. */
export function splitPartOf(node: ProseMirrorNode): number | null {
  const index = node.attrs.splitPartIndex as unknown;
  return typeof index === 'number' && Number.isInteger(index) && index >= 0 ? index : null;
}
