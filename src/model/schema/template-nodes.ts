// The nodes a template fills in: a block holding what its template markup rendered, and an inline
// variable whose text the template's value replaces.

import type { RichTextExtension } from '@flamboyantengineer/ui-components/rich-text-editor/kit';
import type { Node as ProseMirrorNode, NodeSpec } from 'prosemirror-model';
import { DOCUMENT_NODE_ORDER } from './node-order.js';

// A template block holds what its markup rendered last, with the texts the document stored then,
// as its own blocks: the pages lay it out and split it like any other content, and only rendering
// its markup again changes it (DOCE-TEMPLATES-9.1).
const dynamicTemplate: NodeSpec = {
  group: 'block',
  content: 'block*',
  isolating: true,
  defining: true,
  attrs: {
    templateHtml: { default: '' },
    trackedKeys: { default: '' },
  },
  parseDOM: [
    {
      tag: 'div[data-dynamic-template="true"]',
      contentElement: '.template-output',
      getAttrs: (dom: HTMLElement) => ({
        templateHtml: dom.getAttribute('data-dynamic-template-html') || '',
        trackedKeys: dom.getAttribute('data-dynamic-template-keys') || '',
      }),
    },
  ],
  toDOM(node: ProseMirrorNode) {
    const attrs: Record<string, string> = {
      'data-dynamic-template': 'true',
      'data-dynamic-template-html': String(node.attrs.templateHtml || ''),
      class: 'dynamic-template-block',
    };
    if (node.attrs.trackedKeys)
      attrs['data-dynamic-template-keys'] = String(node.attrs.trackedKeys);
    return ['div', attrs, ['div', { class: 'template-output', contenteditable: 'false' }, 0]];
  },
};

const templateVariable: NodeSpec = {
  inline: true,
  group: 'inline',
  selectable: false,
  content: 'text*',
  marks: '',
  attrs: { variableKey: { default: '' } },
  parseDOM: [
    {
      tag: 'span[data-template-variable]',
      priority: 60,
      getAttrs: (dom: HTMLElement) => ({
        variableKey: dom.getAttribute('data-template-variable') || '',
      }),
    },
  ],
  toDOM(node: ProseMirrorNode) {
    return ['span', { 'data-template-variable': String(node.attrs.variableKey || '') }, 0];
  },
};

/** The `dynamic_template` block and the inline `template_variable`. */
export const templateNodesExtension: RichTextExtension = {
  name: 'template-nodes',
  nodes: [
    {
      name: 'dynamic_template',
      spec: dynamicTemplate,
      order: DOCUMENT_NODE_ORDER.dynamic_template,
    },
    {
      name: 'template_variable',
      spec: templateVariable,
      order: DOCUMENT_NODE_ORDER.template_variable,
    },
  ],
};
