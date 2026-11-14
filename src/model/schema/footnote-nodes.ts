// Footnotes: the inline marker in the text, and the entries in each page's footnote area.

import type { RichTextExtension } from '@flamboyantengineer/ui-components/rich-text-editor/kit';
import type { Node as ProseMirrorNode, NodeSpec } from 'prosemirror-model';
import { type DomAttributes, integerAttributeOrNull } from './dom-attributes.js';
import { DOCUMENT_NODE_ORDER } from './node-order.js';
import {
  type DocumentSchemaOptions,
  type ResolvedSchemaOptions,
  resolveSchemaOptions,
} from './schema-options.js';

/** The anchor a footnote's marker carries in print, which its entry's number links back to. */
export const footnoteMarkerAnchor = (footnoteId: string): string => `fnref-${footnoteId}`;

/** The anchor a footnote's entry carries in print, which its marker links to. */
export const footnoteEntryAnchor = (footnoteId: string): string => `fn-${footnoteId}`;

const footnoteAttrs = { footnoteId: { default: null }, footnoteNumber: { default: null } };

function readFootnoteAttrs(dom: HTMLElement) {
  return {
    footnoteId: dom.getAttribute('data-footnote-id') || null,
    footnoteNumber: integerAttributeOrNull(dom, 'data-footnote-number'),
  };
}

/** Writes a footnote's id and number, and the number as its tooltip. */
function writeFootnoteAttrs(
  node: ProseMirrorNode,
  attrs: DomAttributes,
  options: ResolvedSchemaOptions,
): DomAttributes {
  const { footnoteId, footnoteNumber } = node.attrs;
  if (footnoteId) attrs['data-footnote-id'] = String(footnoteId);
  if (Number.isInteger(footnoteNumber)) {
    attrs['data-footnote-number'] = String(footnoteNumber);
    attrs[options.tooltipAttribute] = `Footnote ${String(footnoteNumber)}`;
  }
  return attrs;
}

// The footnote area is page chrome, never a selection target: Delete at the end of the body
// would otherwise select it, and typing over that selection makes an entry with no marker.
const pageFootnotes: NodeSpec = {
  content: 'footnote_entry*',
  defining: true,
  selectable: false,
  parseDOM: [{ tag: 'div.pm-page-footnotes[data-pm-page-footnotes="true"]' }],
  toDOM: () => ['div', { class: 'pm-page-footnotes', 'data-pm-page-footnotes': 'true' }, 0],
};

function footnoteEntry(options: ResolvedSchemaOptions): NodeSpec {
  return {
    content: 'inline*',
    defining: true,
    // An entry is its footnote's whole text: nothing joins into it or out of it.
    isolating: true,
    attrs: footnoteAttrs,
    parseDOM: [
      {
        tag: 'p.pm-footnote-entry[data-footnote-id], p[data-footnote-entry="true"][data-footnote-id]',
        getAttrs: readFootnoteAttrs,
        contentElement: (dom: HTMLElement) =>
          dom.querySelector<HTMLElement>('.pm-footnote-entry-content') ?? dom,
      },
    ],
    toDOM(node: ProseMirrorNode) {
      const base = {
        class: 'pm-footnote-entry',
        'data-footnote-entry': 'true',
        contenteditable: 'true',
      };
      const attrs = writeFootnoteAttrs(node, base, options);
      const number = [
        'span',
        { class: 'pm-footnote-entry-number', contenteditable: 'false' },
        attrs['data-footnote-number'] ?? '',
      ];
      return ['p', attrs, number, ['span', { class: 'pm-footnote-entry-content' }, 0]];
    },
  };
}

function footnoteReference(options: ResolvedSchemaOptions): NodeSpec {
  return {
    inline: true,
    group: 'inline',
    atom: true,
    selectable: true,
    attrs: footnoteAttrs,
    parseDOM: [
      {
        // Above the default priority, so the marker parses as this node, not as the
        // superscript mark, which ProseMirror would otherwise try first.
        priority: 60,
        tag: 'sup[data-footnote-id]',
        getAttrs: readFootnoteAttrs,
      },
    ],
    toDOM(node: ProseMirrorNode) {
      const base = {
        class: 'footnote-reference',
        'data-footnote-reference': 'true',
        contenteditable: 'false',
        spellcheck: 'false',
      };
      const attrs = writeFootnoteAttrs(node, base, options);
      const number = node.attrs.footnoteNumber;
      return ['sup', attrs, Number.isInteger(number) ? String(number) : ''];
    },
  };
}

/** The footnote area of each page, its entries and the markers in the text. */
export function createFootnoteNodesExtension(options?: DocumentSchemaOptions): RichTextExtension {
  const resolved = resolveSchemaOptions(options);
  const order = DOCUMENT_NODE_ORDER;
  return {
    name: 'footnote-nodes',
    nodes: [
      { name: 'page_footnotes', spec: pageFootnotes, order: order.page_footnotes },
      { name: 'footnote_entry', spec: footnoteEntry(resolved), order: order.footnote_entry },
      {
        name: 'footnote_reference',
        spec: footnoteReference(resolved),
        order: order.footnote_reference,
      },
    ],
  };
}
