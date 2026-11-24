// The labels a top-level block and its descendants draw, as a key. A caption or equation number
// that changes can change the block's height, even when the node itself is unchanged.

import type { Node as ProseMirrorNode } from 'prosemirror-model';

/** The caption and equation labels in each top-level page block, in order, by block. */
export function blockLabelKeys(
  doc: ProseMirrorNode,
  labelOf: (node: ProseMirrorNode) => string | undefined,
): ReadonlyMap<ProseMirrorNode, string> {
  const keys = new Map<ProseMirrorNode, string>();
  doc.descendants((node) => {
    if (node.type.name !== 'page_content') return !node.isTextblock;
    node.forEach((block) => {
      let key = labelOf(block) ?? '';
      // A text block holds no nested captions or display equations.
      if (!block.isTextblock)
        block.descendants((child) => {
          const label = labelOf(child);
          if (label !== undefined) key += `,${label}`;
          return !child.isTextblock;
        });
      if (key) keys.set(block, key);
    });
    return false;
  });
  return keys;
}
