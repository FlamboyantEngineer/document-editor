// Math written as LaTeX, inline in the text or as its own block. The LaTeX is the node's text; the
// editor renders it.

import type { RichTextExtension } from '@flamboyantengineer/ui-components/rich-text-editor/kit';
import { Fragment, type NodeSpec, type TagParseRule } from 'prosemirror-model';
import { DOCUMENT_NODE_ORDER } from './node-order.js';

const TEX_ANNOTATION = 'annotation[encoding="application/x-tex"]';

// The LaTeX a pasted MathML `<math>` carries as its TeX annotation, as copied equations and
// typeset web pages hold it, or none.
const texOf = (dom: HTMLElement) => dom.querySelector(TEX_ANNOTATION)?.textContent?.trim() ?? '';

/**
 * MathML with a TeX annotation, pasted back as math of its own display: a `<math display="block">`
 * is display math, any other inline.
 */
function mathMLRule(display: boolean): TagParseRule {
  return {
    tag: 'math',
    getAttrs: (dom) =>
      texOf(dom) !== '' && (dom.getAttribute('display') === 'block') === display ? null : false,
    getContent: (dom, schema) => Fragment.from(schema.text(texOf(dom as HTMLElement))),
  };
}

/**
 * An image of math that carries its LaTeX (`data-latex`, as a copied math image does), pasted back
 * as math: display math when `data-math-display` says `display`, inline math otherwise.
 */
function mathImageRule(display: boolean): TagParseRule {
  const latexOf = (dom: HTMLElement) => dom.getAttribute('data-latex')?.trim() ?? '';
  return {
    tag: 'img[data-latex]',
    // Ahead of the image node's rule for any image (priority 60).
    priority: 70,
    getAttrs: (dom) =>
      latexOf(dom) !== '' && (dom.getAttribute('data-math-display') === 'display') === display
        ? null
        : false,
    getContent: (dom, schema) => Fragment.from(schema.text(latexOf(dom as HTMLElement))),
  };
}

/** A math node, inline or shown as its own block. */
function createMathNode(display: boolean): NodeSpec {
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
    ]
      .map((selector): TagParseRule => ({ tag: selector, preserveWhitespace: 'full' }))
      .concat(mathMLRule(display), mathImageRule(display)),
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
