// Stored nodes the schema does not know, kept as they were stored when a document is read with
// `unknown: 'keep'` (DOCE-FORMAT-1.5). Each holds its stored node whole, shows as an empty
// placeholder the writer cannot edit, and is written back unchanged.

import type { RichTextExtension } from '@flamboyantengineer/ui-components/rich-text-editor';
import type { Node as ProseMirrorNode, NodeSpec } from 'prosemirror-model';
import { DOCUMENT_NODE_ORDER } from './node-order.js';

function keptNode(display: boolean): NodeSpec {
  return {
    group: display ? 'block' : 'inline',
    inline: !display,
    atom: true,
    selectable: true,
    attrs: { stored: { default: null } },
    toDOM: (node: ProseMirrorNode) => [
      display ? 'div' : 'span',
      {
        class: 'kept-node',
        'data-kept-type': String((node.attrs.stored as { type?: unknown } | null)?.type ?? ''),
        contenteditable: 'false',
      },
    ],
  };
}

/** Kept stored nodes, a block and an inline one. */
export const keptNodesExtension: RichTextExtension = {
  name: 'kept-nodes',
  nodes: [
    { name: 'kept_block', spec: keptNode(true), order: DOCUMENT_NODE_ORDER.kept_block },
    { name: 'kept_inline', spec: keptNode(false), order: DOCUMENT_NODE_ORDER.kept_inline },
  ],
};
