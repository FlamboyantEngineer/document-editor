// Stored nodes the schema does not know, kept as they were stored when a document is read with
// `unknown: 'keep'` (DOCE-FORMAT-1.5). Each holds its stored node whole, shows as an empty
// placeholder the writer cannot edit, and is written back unchanged.

import type { RichTextExtension } from '@flamboyantengineer/ui-components/rich-text-editor';
import type { Node as ProseMirrorNode, NodeSpec } from 'prosemirror-model';
import { DOCUMENT_NODE_ORDER } from './node-order.js';

const KEPT_ATTR = 'data-kept-node';

// The stored node an element carries, when it is one: an object with a type, as it was stored.
function storedOf(element: HTMLElement): Record<string, unknown> | false {
  try {
    const stored: unknown = JSON.parse(element.getAttribute(KEPT_ATTR) ?? '');
    const isNode =
      typeof stored === 'object' &&
      stored !== null &&
      typeof (stored as { type?: unknown }).type === 'string';
    return isNode ? (stored as Record<string, unknown>) : false;
  } catch {
    return false;
  }
}

function keptNode(display: boolean): NodeSpec {
  const tag = display ? 'div' : 'span';
  return {
    group: display ? 'block' : 'inline',
    inline: !display,
    atom: true,
    selectable: true,
    attrs: { stored: { default: null } },
    // The stored node goes with its placeholder, so a copy, a cut and an HTML round trip keep it.
    toDOM: (node: ProseMirrorNode) => [
      tag,
      {
        class: 'kept-node',
        'data-kept-type': String((node.attrs.stored as { type?: unknown } | null)?.type ?? ''),
        [KEPT_ATTR]: JSON.stringify(node.attrs.stored),
        contenteditable: 'false',
      },
    ],
    parseDOM: [
      {
        tag: `${tag}[${KEPT_ATTR}]`,
        getAttrs: (element: HTMLElement) => {
          const stored = storedOf(element);
          return stored && { stored };
        },
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
