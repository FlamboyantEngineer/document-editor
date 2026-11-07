// The nodes a template fills in: a block rendered from template markup, and an inline variable
// whose text the template's value replaces.

import type { RichTextExtension } from '@flamboyantengineer/ui-components/rich-text-editor';
import type { Node as ProseMirrorNode, NodeSpec } from 'prosemirror-model';
import { DOCUMENT_NODE_ORDER } from './node-order.js';

const dynamicTemplate: NodeSpec = {
  group: 'block',
  atom: true,
  selectable: true,
  attrs: {
    templateHtml: { default: '' },
    renderedHtml: { default: '' },
    trackedKeys: { default: '' },
  },
  parseDOM: [
    {
      tag: 'div[data-dynamic-template="true"]',
      getAttrs: (dom: HTMLElement) => ({
        templateHtml: dom.getAttribute('data-dynamic-template-html') || '',
        renderedHtml:
          dom.getAttribute('data-dynamic-template-rendered-html') || dom.innerHTML || '',
        trackedKeys: dom.getAttribute('data-dynamic-template-keys') || '',
      }),
    },
  ],
  toDOM(node: ProseMirrorNode) {
    const attrs: Record<string, string> = {
      'data-dynamic-template': 'true',
      'data-dynamic-template-html': String(node.attrs.templateHtml || ''),
      'data-dynamic-template-rendered-html': String(node.attrs.renderedHtml || ''),
      class: 'dynamic-template-block',
    };
    if (node.attrs.trackedKeys)
      attrs['data-dynamic-template-keys'] = String(node.attrs.trackedKeys);
    return ['div', attrs];
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
