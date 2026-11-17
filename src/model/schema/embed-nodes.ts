// An embed: content the host keeps elsewhere, such as a data set or another document's part, shown
// in the document as its own blocks, or inline as its text, such as one cell of a spreadsheet. The
// embed records the host's kind and id for the content, the state it shows and whether it stays
// at that state; only taking an update from the host changes what it holds.

import type { RichTextExtension } from '@flamboyantengineer/ui-components/rich-text-editor/kit';
import type { Node as ProseMirrorNode, NodeSpec } from 'prosemirror-model';
import type { DomAttributes } from './dom-attributes.js';
import { DOCUMENT_NODE_ORDER } from './node-order.js';

/** The embed node type's name. */
export const EMBED_NODE = 'embed';

/** The inline embed node type's name. */
export const INLINE_EMBED_NODE = 'embed_inline';

// What both embeds record of the host's content.
const SOURCE_ATTRS = {
  /** The host's kind of content. */
  kind: { default: '', validate: 'string' },
  /** The host's id of the content within its kind. */
  source: { default: '', validate: 'string' },
  /** The host's id of the state of the content the embed shows. */
  snapshot: { default: null },
  /** How the editor names the content. */
  label: { default: '', validate: 'string' },
  /** Whether the embed stays at the state it shows, rather than following the content. */
  pinned: { default: false, validate: 'boolean' },
} satisfies NodeSpec['attrs'];

function readSource(dom: HTMLElement) {
  return {
    kind: dom.getAttribute('data-embed-kind') ?? '',
    source: dom.getAttribute('data-embed-source') ?? '',
    snapshot: dom.getAttribute('data-embed-snapshot') || null,
    label: dom.getAttribute('data-embed-label') ?? '',
    pinned: dom.getAttribute('data-embed-pinned') === 'true',
  };
}

function sourceAttributes(node: ProseMirrorNode, className: string): DomAttributes {
  const attrs: DomAttributes = {
    class: className,
    'data-embed-kind': String(node.attrs.kind),
    'data-embed-source': String(node.attrs.source),
    'data-embed-label': String(node.attrs.label),
  };
  if (node.attrs.snapshot) attrs['data-embed-snapshot'] = String(node.attrs.snapshot);
  if (node.attrs.pinned === true) attrs['data-embed-pinned'] = 'true';
  return attrs;
}

// What an embed may hold: blocks of text, lists, tables and objects, but no other embed.
const EMBED_CONTENT =
  '(paragraph | heading | bullet_list | ordered_list | table_figure | figure | math_display | code_block | horizontal_rule)+';

const embed: NodeSpec = {
  group: 'block',
  content: EMBED_CONTENT,
  isolating: true,
  attrs: SOURCE_ATTRS,
  parseDOM: [{ tag: 'div[data-embed-kind]', getAttrs: readSource }],
  toDOM: (node: ProseMirrorNode) => ['div', sourceAttributes(node, 'de-embed'), 0],
};

// An inline embed: the host's content as its text, one atom the writer selects, moves or deletes.
const inlineEmbed: NodeSpec = {
  group: 'inline',
  inline: true,
  atom: true,
  attrs: { ...SOURCE_ATTRS, text: { default: '', validate: 'string' } },
  parseDOM: [
    {
      tag: 'span[data-embed-kind]',
      getAttrs: (dom: HTMLElement) => ({ ...readSource(dom), text: dom.textContent }),
    },
  ],
  toDOM: (node: ProseMirrorNode) => [
    'span',
    sourceAttributes(node, 'de-embed-inline'),
    String(node.attrs.text),
  ],
  leafText: (node: ProseMirrorNode) => String(node.attrs.text),
};

/** Whether a node is a block embed. */
export const isEmbed = (node: ProseMirrorNode) => node.type.name === EMBED_NODE;

/** Whether a node is an inline embed. */
export const isInlineEmbed = (node: ProseMirrorNode) => node.type.name === INLINE_EMBED_NODE;

/** Embeds, as blocks and inline. */
export const embedNodesExtension: RichTextExtension = {
  name: 'embed-nodes',
  nodes: [
    { name: EMBED_NODE, spec: embed, order: DOCUMENT_NODE_ORDER.embed },
    { name: INLINE_EMBED_NODE, spec: inlineEmbed, order: DOCUMENT_NODE_ORDER.embed_inline },
  ],
};
