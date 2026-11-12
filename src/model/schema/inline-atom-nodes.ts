// The inline atoms a document's text holds beside its characters: a mention of a person, a
// reference to a glossary entry, and a person's signature.

import type { RichTextExtension } from '@flamboyantengineer/ui-components/rich-text-editor';
import type { Node as ProseMirrorNode, NodeSpec } from 'prosemirror-model';
import { abbreviationDisplayText, abbreviationTargetId, abbreviationTooltip } from '../glossary.js';
import { normalizeSignatureVector, type SignatureVector } from '../signature-vector.js';
import type { DomAttributes } from './dom-attributes.js';
import { DOCUMENT_NODE_ORDER } from './node-order.js';
import {
  type DocumentSchemaOptions,
  type ResolvedSchemaOptions,
  resolveSchemaOptions,
} from './schema-options.js';

/** A mention's attributes and text, as the editor and exported markup both write them. */
export function mentionPresentation(
  person: { id: string; label: string },
  options: Pick<ResolvedSchemaOptions, 'mentionClass'>,
): { attributes: DomAttributes; text: string } {
  const id = person.id.trim();
  const label = person.label.trim() || id;
  const text = `@${label}`;
  const attributes: DomAttributes = {
    class: options.mentionClass,
    'data-mention-kind': 'user',
    'data-mention-user-id': id,
    'data-mention-label': label,
    'aria-label': text,
    contenteditable: 'false',
    tabindex: '-1',
  };
  return { attributes, text };
}

function mention(options: ResolvedSchemaOptions): NodeSpec {
  return {
    inline: true,
    group: 'inline',
    atom: true,
    selectable: false,
    attrs: { userId: { default: '' }, label: { default: '' } },
    parseDOM: [
      {
        tag: 'span[data-mention-user-id]',
        getAttrs: (dom: HTMLElement) => ({
          userId: dom.getAttribute('data-mention-user-id') || '',
          label:
            dom.getAttribute('data-mention-label') || (dom.textContent || '').replace(/^@/, ''),
        }),
      },
    ],
    toDOM(node: ProseMirrorNode) {
      const person = { id: String(node.attrs.userId || ''), label: String(node.attrs.label || '') };
      const { attributes, text } = mentionPresentation(person, options);
      return ['span', attributes, text];
    },
  };
}

function abbreviationReference(options: ResolvedSchemaOptions): NodeSpec {
  return {
    inline: true,
    group: 'inline',
    atom: true,
    selectable: true,
    attrs: {
      entryId: { default: '' },
      display: { default: 'full' },
      abbr: { default: '' },
      expansion: { default: '' },
    },
    leafText: (node) => abbreviationDisplayText(node.attrs),
    parseDOM: [
      {
        priority: 60,
        tag: 'span[data-abbreviation-ref]',
        getAttrs: (dom: HTMLElement) => ({
          entryId: dom.getAttribute('data-abbreviation-ref') || '',
          display: dom.getAttribute('data-abbr-display') === 'short' ? 'short' : 'full',
          abbr: dom.getAttribute('data-abbr') || '',
          expansion: dom.getAttribute('data-expansion') || '',
        }),
      },
    ],
    toDOM(node: ProseMirrorNode) {
      const { entryId, display, abbr, expansion } = node.attrs;
      const tooltip = abbreviationTooltip(node.attrs);
      const link = {
        href: `#${abbreviationTargetId(String(entryId))}`,
        'data-abbr-tooltip': tooltip,
        [options.tooltipAttribute]: tooltip,
        tabindex: '0',
      };
      const attrs = {
        'data-abbreviation-ref': entryId,
        'data-abbr-display': display,
        'data-abbr': abbr,
        'data-expansion': expansion,
        contenteditable: 'false',
      };
      return ['span', attrs, ['a', link, abbreviationDisplayText(node.attrs)]];
    },
  };
}

/** The inlined vector attribute, or null when it is missing or not canonical. */
function parseVectorAttribute(raw: string | null): SignatureVector | null {
  if (!raw) return null;
  try {
    return normalizeSignatureVector(JSON.parse(raw));
  } catch {
    return null;
  }
}

// One person's signature. A signed signature inlines its vector, so a released document renders
// without resolving anything; the revision id is a record of what was signed, never needed to render.
const signature: NodeSpec = {
  inline: true,
  group: 'inline',
  atom: true,
  selectable: false,
  // Dragging a signature to another place would move an approval silently, and a pasted copy
  // would show an approval nobody gave there (DOCE-EDITING-5.2).
  draggable: false,
  pastable: false,
  attrs: {
    userId: { default: '' },
    displayName: { default: '' },
    vector: { default: null },
    signatureRevisionId: { default: null },
  },
  parseDOM: [
    {
      tag: 'span[data-signature]',
      // A signed span also says who wrote it; it parses as this atom, not the contributor mark.
      priority: 60,
      getAttrs: (dom: HTMLElement) => ({
        userId: dom.getAttribute('data-signature') || '',
        displayName: dom.getAttribute('data-signature-name') || '',
        vector: parseVectorAttribute(dom.getAttribute('data-signature-vector')),
        signatureRevisionId: dom.getAttribute('data-signature-revision') || null,
      }),
    },
  ],
  toDOM(node: ProseMirrorNode) {
    const vector = normalizeSignatureVector(node.attrs.vector);
    const attrs: DomAttributes = {
      class: 'signature-inline',
      'data-signature': String(node.attrs.userId || ''),
      'data-signature-name': String(node.attrs.displayName || ''),
    };
    if (node.attrs.signatureRevisionId) {
      attrs['data-signature-revision'] = String(node.attrs.signatureRevisionId);
    }
    // Written only once signed, so an unsigned document carries no empty vector.
    if (vector) attrs['data-signature-vector'] = JSON.stringify(vector);
    return ['span', attrs];
  },
};

/** Mentions, glossary references and signatures. */
export function createInlineAtomNodesExtension(options?: DocumentSchemaOptions): RichTextExtension {
  const resolved = resolveSchemaOptions(options);
  const order = DOCUMENT_NODE_ORDER;
  return {
    name: 'inline-atom-nodes',
    nodes: [
      { name: 'mention', spec: mention(resolved), order: order.mention },
      { name: 'signature', spec: signature, order: order.signature },
      {
        name: 'abbreviation_reference',
        spec: abbreviationReference(resolved),
        order: order.abbreviation_reference,
      },
    ],
  };
}
