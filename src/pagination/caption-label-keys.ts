// The caption labels each top-level block of a document's page content draws, as a key: a label
// that changes, as `Figure 1` becoming `Figure 10` after figures inserted before it, changes the
// block's height, so a block the engine kept is laid out again (DOCE-PAGINATION-11.1).

import type { Node as ProseMirrorNode } from 'prosemirror-model';

/** The labels the captions in each top-level page block show, in order, by block. */
export function captionLabelKeys(
  doc: ProseMirrorNode,
  labelOf: (caption: ProseMirrorNode) => string | undefined,
): ReadonlyMap<ProseMirrorNode, string> {
  const keys = new Map<ProseMirrorNode, string>();
  doc.descendants((node) => {
    if (node.type.name !== 'page_content') return !node.isTextblock;
    node.forEach((block) => {
      let key = labelOf(block) ?? '';
      // A text block holds no captions, so its text is not walked.
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
