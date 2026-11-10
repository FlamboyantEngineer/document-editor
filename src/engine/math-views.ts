// Math as it reads: each inline or display math node drawn as its typeset MathML, through the base
// library's KaTeX renderer, in every view the plugin runs in, the pages' measuring view too. The
// LaTeX source shows until the math is typeset, and stays, marked invalid, when it does not
// typeset. A view whose math changes size asks the pages to measure again (`de-remeasure`).

import { type MathRenderer, renderKatexMath } from '@flamboyantengineer/ui-components/math-preview';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import type { EditorView, NodeView } from 'prosemirror-view';
import { REMEASURE_EVENT } from '../utils/remeasure.js';

// The MathML elements and attributes typeset math may hold; anything else is dropped.
const MATHML_ELEMENTS = new Set([
  'math',
  'semantics',
  'annotation',
  'mrow',
  'mi',
  'mn',
  'mo',
  'ms',
  'mtext',
  'mspace',
  'mfrac',
  'msqrt',
  'mroot',
  'msub',
  'msup',
  'msubsup',
  'munder',
  'mover',
  'munderover',
  'mtable',
  'mtr',
  'mtd',
  'mpadded',
  'mphantom',
  'menclose',
  'mstyle',
  'merror',
  'mmultiscripts',
  'mprescripts',
  'none',
]);
const MATHML_ATTRIBUTES = new Set([
  'display',
  'mathvariant',
  'stretchy',
  'fence',
  'separator',
  'lspace',
  'rspace',
  'accent',
  'accentunder',
  'linethickness',
  'columnalign',
  'rowalign',
  'columnspacing',
  'rowspacing',
  'columnlines',
  'rowlines',
  'frame',
  'scriptlevel',
  'displaystyle',
  'width',
  'height',
  'depth',
  'voffset',
  'minsize',
  'maxsize',
  'movablelimits',
  'notation',
  'encoding',
  'symmetric',
  'largeop',
  'form',
  'mathsize',
]);

const MATHML = 'http://www.w3.org/1998/Math/MathML';

// A copy of the typeset markup in the view's document, keeping only MathML's allowed parts.
function sanitized(owner: Document, markup: string): Node | null {
  const parser = owner.defaultView?.DOMParser;
  if (!parser) return null;
  const parsed = new parser().parseFromString(markup, 'text/html');
  const copy = (node: Node): Node | null => {
    if (node.nodeType === 3) return owner.createTextNode(node.textContent ?? '');
    if (node.nodeType !== 1) return null;
    const element = node as Element;
    const name = element.localName;
    if (!MATHML_ELEMENTS.has(name)) return null;
    const out = owner.createElementNS(MATHML, name);
    for (const attribute of element.attributes) {
      if (MATHML_ATTRIBUTES.has(attribute.name)) out.setAttribute(attribute.name, attribute.value);
    }
    for (const child of element.childNodes) {
      const kept = copy(child);
      if (kept) out.appendChild(kept);
    }
    return out;
  };
  const math = parsed.body.querySelector('math');
  return math ? copy(math) : null;
}

// Draws one math node, typesetting its source and drawing it again when the source changes.
function mathView(node: ProseMirrorNode, view: EditorView, render: MathRenderer): NodeView {
  const display = node.type.name === 'math_display';
  const owner = view.dom.ownerDocument;
  const dom = owner.createElement(display ? 'div' : 'span');
  dom.className = 'de-math';
  dom.dataset.display = display ? 'display' : 'inline';
  dom.contentEditable = 'false';
  let source: string | null = null;
  let current = node;
  const draw = (next: ProseMirrorNode) => {
    current = next;
    const latex = next.textContent;
    if (latex === source) return;
    source = latex;
    dom.textContent = latex;
    dom.dataset.state = 'pending';
    dom.removeAttribute('title');
    void Promise.resolve(render(latex, { displayMode: display }))
      .then((result) => {
        if (source !== latex) return;
        const math = result.ok ? sanitized(dom.ownerDocument, result.mathml) : null;
        if (math) dom.replaceChildren(math);
        else if (!result.ok) dom.title = result.message;
        dom.dataset.state = math ? 'ready' : 'invalid';
        const Event = dom.ownerDocument.defaultView?.CustomEvent;
        if (Event) dom.dispatchEvent(new Event(REMEASURE_EVENT, { bubbles: true }));
      })
      .catch(() => {
        if (source === latex) dom.dataset.state = 'invalid';
      });
  };
  draw(node);
  return {
    dom,
    update(next) {
      if (next.type !== current.type) return false;
      draw(next);
      return true;
    },
    selectNode: () => dom.setAttribute('data-selected', 'true'),
    deselectNode: () => dom.removeAttribute('data-selected'),
    ignoreMutation: () => true,
  };
}

const mathViewsKey = new PluginKey('math-views');

/** How math is typeset. */
export interface MathViewsOptions {
  /** Typesets LaTeX to MathML; the base library's KaTeX renderer by default. */
  readonly render?: MathRenderer | undefined;
}

/** Draws math as typeset MathML in every view the plugin runs in. */
export function createMathViews({ render = renderKatexMath }: MathViewsOptions = {}): Plugin {
  return new Plugin({
    key: mathViewsKey,
    props: {
      nodeViews: {
        math_inline: (node, view) => mathView(node, view, render),
        math_display: (node, view) => mathView(node, view, render),
      },
    },
  });
}
