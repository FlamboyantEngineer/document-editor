// An embed: content the host keeps elsewhere, such as a data set or another document's part, shown
// in the document as its own blocks. The embed records the host's kind and id for the content and
// the state it shows; only taking an update from the host changes what it holds.

import type { RichTextExtension } from '@flamboyantengineer/ui-components/rich-text-editor/kit';
import type { Node as ProseMirrorNode, NodeSpec } from 'prosemirror-model';
import type { DomAttributes } from './dom-attributes.js';
import { DOCUMENT_NODE_ORDER } from './node-order.js';

/** The embed node type's name. */
export const EMBED_NODE = 'embed';

// What an embed may hold: blocks of text, lists, tables and objects, but no other embed.
const EMBED_CONTENT =
  '(paragraph | heading | bullet_list | ordered_list | table | figure | math_display | code_block | horizontal_rule)+';

const embed: NodeSpec = {
  group: 'block',
  content: EMBED_CONTENT,
  isolating: true,
  attrs: {
    /** The host's kind of content. */
    kind: { default: '', validate: 'string' },
    /** The host's id of the content within its kind. */
    source: { default: '', validate: 'string' },
    /** The host's id of the state of the content the embed shows. */
    snapshot: { default: null },
    /** How the editor names the content. */
    label: { default: '', validate: 'string' },
  },
  parseDOM: [
    {
      tag: 'div[data-embed-kind]',
      getAttrs: (dom: HTMLElement) => ({
        kind: dom.getAttribute('data-embed-kind') ?? '',
        source: dom.getAttribute('data-embed-source') ?? '',
        snapshot: dom.getAttribute('data-embed-snapshot') || null,
        label: dom.getAttribute('data-embed-label') ?? '',
      }),
    },
  ],
  toDOM(node: ProseMirrorNode) {
    const attrs: DomAttributes = {
      class: 'de-embed',
      'data-embed-kind': String(node.attrs.kind),
      'data-embed-source': String(node.attrs.source),
      'data-embed-label': String(node.attrs.label),
    };
    if (node.attrs.snapshot) attrs['data-embed-snapshot'] = String(node.attrs.snapshot);
    return ['div', attrs, 0];
  },
};

/** Whether a node is an embed. */
export const isEmbed = (node: ProseMirrorNode) => node.type.name === EMBED_NODE;

/** Embeds. */
export const embedNodesExtension: RichTextExtension = {
  name: 'embed-nodes',
  nodes: [{ name: EMBED_NODE, spec: embed, order: DOCUMENT_NODE_ORDER.embed }],
};
