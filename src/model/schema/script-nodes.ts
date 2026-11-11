// A script block: a script a host runs, kept with the content it produced last, which the document
// shows and prints as its own. The script is the block's `script`; the output is its content, which
// only running the script changes.

import type { RichTextExtension } from '@flamboyantengineer/ui-components/rich-text-editor';
import type { Node as ProseMirrorNode, NodeSpec } from 'prosemirror-model';
import type { DomAttributes } from './dom-attributes.js';
import { DOCUMENT_NODE_ORDER } from './node-order.js';

const scriptBlock: NodeSpec = {
  group: 'block',
  content: 'block*',
  isolating: true,
  defining: true,
  attrs: {
    script: { default: '' },
    /** `manual`, run when asked, or `open`, run each time the document opens. */
    refreshPolicy: { default: 'manual' },
    /** When the output was produced, as an ISO 8601 date and time. */
    renderedAt: { default: null },
  },
  parseDOM: [
    {
      tag: 'section[data-block-type="scripted-content"]',
      contentElement: '.script-output',
      getAttrs: (dom: HTMLElement) => ({
        script: dom.getAttribute('data-script') ?? '',
        refreshPolicy: dom.getAttribute('data-refresh-policy') === 'open' ? 'open' : 'manual',
        renderedAt: dom.getAttribute('data-rendered-at') || null,
      }),
    },
  ],
  toDOM(node: ProseMirrorNode) {
    const attrs: DomAttributes = {
      class: 'script-block',
      'data-block-type': 'scripted-content',
      'data-script': String(node.attrs.script ?? ''),
      'data-refresh-policy': node.attrs.refreshPolicy === 'open' ? 'open' : 'manual',
    };
    if (node.attrs.renderedAt) attrs['data-rendered-at'] = String(node.attrs.renderedAt);
    return ['section', attrs, ['div', { class: 'script-output' }, 0]];
  },
};

/** Script blocks. */
export const scriptNodesExtension: RichTextExtension = {
  name: 'script-nodes',
  nodes: [{ name: 'script_block', spec: scriptBlock, order: DOCUMENT_NODE_ORDER.script_block }],
};
