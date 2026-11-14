// Math written as LaTeX, inline in the text or as its own block. The LaTeX is the node's text; the
// editor renders it.

import type { RichTextExtension } from '@flamboyantengineer/ui-components/rich-text-editor/kit';
import type { NodeSpec } from 'prosemirror-model';
import { DOCUMENT_NODE_ORDER } from './node-order.js';

/** A math node, inline or shown as its own block. */
export function createMathNode(display: boolean): NodeSpec {
  const tag = display ? 'div' : 'span';
  const kind = display ? 'display' : 'inline';
  const typeAttr = display ? 'data-block-type' : 'data-inline-type';
  const contentAttr = display ? 'data-latex-content' : 'data-inline-content';
  return {
    group: display ? 'block' : 'inline',
    inline: !display,
    content: 'text*',
    atom: true,
    code: true,
    isolating: true,
    marks: '',
    parseDOM: [
      `${tag}[${typeAttr}="latex"]`,
      `${tag}.math-node-${kind}`,
      `${tag}[data-math-node="${kind}"]`,
    ].map((selector) => ({ tag: selector, preserveWhitespace: 'full' as const })),
    toDOM: (node) => [tag, { [typeAttr]: 'latex', [contentAttr]: node.textContent || '' }, 0],
  };
}

/** Inline and display math. */
export const mathNodesExtension: RichTextExtension = {
  name: 'math-nodes',
  nodes: [
    { name: 'math_inline', spec: createMathNode(false), order: DOCUMENT_NODE_ORDER.math_inline },
    { name: 'math_display', spec: createMathNode(true), order: DOCUMENT_NODE_ORDER.math_display },
  ],
};
