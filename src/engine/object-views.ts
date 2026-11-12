// Views of the objects their markup does not draw whole: code with a gutter of line numbers from
// its first line's number, and signatures drawn from their stored vector with the signer's name,
// or as the place a signature goes until it is signed. They draw in every view, the pages'
// measuring view too.

import { DOMSerializer, type Node as ProseMirrorNode } from 'prosemirror-model';
import { NodeSelection, Plugin, PluginKey } from 'prosemirror-state';
import type { EditorView, NodeView } from 'prosemirror-view';
import { normalizeSignatureVector } from '../model/index.js';

/** The line numbers of a code text, from its first line's number, one per line. */
export function lineNumbers(code: string, first = 1): string {
  const count = code.split('\n').length;
  return Array.from({ length: count }, (_, index) => String(first + index)).join('\n');
}

const firstLine = (node: ProseMirrorNode) => {
  const linked = node.type.name === 'linked_code_block';
  const value = Number(linked ? node.attrs.startLine : node.attrs.codeLineStart);
  return Number.isInteger(value) && value > 0 ? value : 1;
};

const codeText = (node: ProseMirrorNode) =>
  node.type.name === 'linked_code_block' ? String(node.attrs.code ?? '') : node.textContent;

const sameAttrs = (a: ProseMirrorNode, b: ProseMirrorNode) =>
  JSON.stringify(a.attrs) === JSON.stringify(b.attrs);

// A code block as its markup draws it, with a gutter of line numbers before its code.
function codeView(node: ProseMirrorNode, view: EditorView): NodeView {
  const owner = view.dom.ownerDocument;
  const spec = node.type.spec.toDOM?.(node);
  if (!spec) throw new Error(`${node.type.name} has no markup`);
  const { dom, contentDOM } = DOMSerializer.renderSpec(owner, spec);
  const element = dom as HTMLElement;
  const pre = element.tagName === 'PRE' ? element : element.querySelector('pre');
  const code = pre?.querySelector('code');
  const gutter = owner.createElement('span');
  gutter.className = 'de-code-gutter';
  gutter.setAttribute('aria-hidden', 'true');
  gutter.contentEditable = 'false';
  if (pre && code) pre.insertBefore(gutter, code);
  let current = node;
  const draw = (next: ProseMirrorNode) => {
    current = next;
    gutter.textContent = lineNumbers(codeText(next), firstLine(next));
  };
  draw(node);
  return {
    dom,
    contentDOM: contentDOM ?? undefined,
    update(next) {
      // Another type, or other attributes such as another language, draws the block again.
      if (next.type !== current.type || !sameAttrs(next, current)) return false;
      draw(next);
      return true;
    },
    // Only the code's own text is the document's; the gutter and the caption line are drawn.
    ignoreMutation: (mutation) => !contentDOM || !contentDOM.contains(mutation.target),
  };
}

const SVG = 'http://www.w3.org/2000/svg';

// Draws a signature: its strokes, from its stored vector, then the signer's name.
function signatureView(node: ProseMirrorNode, view: EditorView): NodeView {
  const owner = view.dom.ownerDocument;
  const dom = owner.createElement('span');
  dom.className = 'de-signature';
  dom.contentEditable = 'false';
  const draw = (next: ProseMirrorNode) => {
    const vector = normalizeSignatureVector(next.attrs.vector);
    const name = String(next.attrs.displayName ?? '');
    dom.dataset.signed = vector ? 'true' : 'false';
    dom.setAttribute('data-signature', String(next.attrs.userId ?? ''));
    dom.replaceChildren();
    if (vector) {
      const svg = owner.createElementNS(SVG, 'svg');
      const { width, height } = vector.viewBox;
      svg.setAttribute('viewBox', `0 0 ${String(width)} ${String(height)}`);
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', name);
      for (const path of vector.paths) {
        const stroke = owner.createElementNS(SVG, 'path');
        stroke.setAttribute('d', path.d);
        stroke.setAttribute('fill', path.fill ? 'currentColor' : 'none');
        stroke.setAttribute('stroke', path.fill ? 'none' : 'currentColor');
        if (path.strokeWidth !== null)
          stroke.setAttribute('stroke-width', String(path.strokeWidth));
        if (path.transform) stroke.setAttribute('transform', `matrix(${path.transform.join(' ')})`);
        svg.appendChild(stroke);
      }
      dom.appendChild(svg);
    }
    const label = owner.createElement('span');
    label.className = 'de-signature__name';
    label.textContent = name;
    dom.appendChild(label);
  };
  let current = node;
  draw(node);
  return {
    dom,
    update(next) {
      if (next.type !== current.type) return false;
      current = next;
      draw(next);
      return true;
    },
    ignoreMutation: () => true,
  };
}

// Whether typing replaces a selected node: as its type's spec says (`replaceOnType`), or else for
// inline nodes only, so typing over a selected block object, such as linked code, leaves it.
function isReplacedOnType(node: ProseMirrorNode): boolean {
  const replaces = node.type.spec.replaceOnType as unknown;
  return typeof replaces === 'boolean' ? replaces : node.isInline;
}

/** Which code shows line numbers. */
export type LineNumbers = 'all' | 'linked' | 'none';

/** How the object views draw. */
export interface ObjectViewsOptions {
  /** Which code shows line numbers: all of it, linked code only (the default), or none. */
  readonly lineNumbers?: LineNumbers | undefined;
}

/**
 * Draws code with its line numbers and signatures from their vector, in every view, and keeps a
 * selected node that is not replaced on typing (`isReplacedOnType`) from the writer's typing.
 */
export function createObjectViews({
  lineNumbers: numbered = 'linked',
}: ObjectViewsOptions = {}): Plugin {
  const code = (node: ProseMirrorNode, view: EditorView) => codeView(node, view);
  return new Plugin({
    key: new PluginKey('object-views'),
    props: {
      handleTextInput: ({ state }) =>
        state.selection instanceof NodeSelection && !isReplacedOnType(state.selection.node),
      nodeViews: {
        signature: (node, view) => signatureView(node, view),
        ...(numbered === 'none' ? {} : { linked_code_block: code }),
        ...(numbered === 'all' ? { code_block: code } : {}),
      },
    },
  });
}
