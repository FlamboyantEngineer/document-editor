// A script block: a script a host runs, kept with the content it produced last, which the document
// shows and prints as its own. The script is the block's `script`; the output is its content, which
// only running the script changes.

import type { RichTextExtension } from '@flamboyantengineer/ui-components/rich-text-editor/kit';
import type { Node as ProseMirrorNode, NodeSpec } from 'prosemirror-model';
import type { DomAttributes } from './dom-attributes.js';
import { DOCUMENT_NODE_ORDER } from './node-order.js';

/** Where a script block's output came from, as the host's script runner reports it. */
export interface ScriptProvenance {
  /** What ran the script, such as a host's runner or catalog entry. */
  source?: string | null;
  /** The revision of the script that ran, as the host names it. */
  revision?: string | null;
  /** The key of the inputs it ran with, so a host can tell whether they changed. */
  inputs?: string | null;
}

/** A signature a script placed in its output: who signed, their name, and the signed revision. */
export interface ScriptSignature {
  person: string;
  label?: string | null;
  revision?: string | null;
}

// A JSON attribute: an object or a list, else none.
function readJson(dom: HTMLElement, name: string, list: boolean): unknown {
  const value = dom.getAttribute(name);
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    const valid = list
      ? Array.isArray(parsed)
      : Boolean(parsed) && typeof parsed === 'object' && !Array.isArray(parsed);
    return valid ? parsed : null;
  } catch {
    return null;
  }
}

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
    /** Where its output came from (`ScriptProvenance`), or null. */
    provenance: { default: null },
    /** The signatures its output carries (`ScriptSignature[]`), or null for none. */
    signatures: { default: null },
  },
  parseDOM: [
    {
      tag: 'section[data-block-type="scripted-content"]',
      contentElement: '.script-output',
      getAttrs: (dom: HTMLElement) => ({
        script: dom.getAttribute('data-script') ?? '',
        refreshPolicy: dom.getAttribute('data-refresh-policy') === 'open' ? 'open' : 'manual',
        renderedAt: dom.getAttribute('data-rendered-at') || null,
        provenance: readJson(dom, 'data-provenance', false),
        signatures: readJson(dom, 'data-signatures', true),
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
    if (node.attrs.provenance) attrs['data-provenance'] = JSON.stringify(node.attrs.provenance);
    if (node.attrs.signatures) attrs['data-signatures'] = JSON.stringify(node.attrs.signatures);
    return ['section', attrs, ['div', { class: 'script-output' }, 0]];
  },
};

/** Script blocks. */
export const scriptNodesExtension: RichTextExtension = {
  name: 'script-nodes',
  nodes: [{ name: 'script_block', spec: scriptBlock, order: DOCUMENT_NODE_ORDER.script_block }],
};
