// Views of the objects their markup does not draw whole: code with a gutter of line numbers from
// its first line's number and its tokens highlighted (painted over, in code blocks), and
// signatures drawn from their stored vector with the signer's name, or as the place a signature
// goes until it is signed. They draw in every view, the pages' measuring view too. A selected
// block object is kept from typing.

import { DOMSerializer, type Node as ProseMirrorNode } from 'prosemirror-model';
import {
  type Command,
  type EditorState,
  NodeSelection,
  Plugin,
  PluginKey,
} from 'prosemirror-state';
import { DecorationSet, type EditorView, type NodeView } from 'prosemirror-view';
import { normalizeSignatureVector } from '../model/index.js';
import {
  cancelCaptionOf,
  captionDoubleClick,
  captionEditingDecorations,
  captionEditingOf,
  commitCaptionOf,
  editCaptionOf,
  updateCaptionEditing,
} from './caption-views.js';
import type { CaptionedObject } from './captions.js';
import { codeTokenAttrs, highlightCode, paintCodeHighlights } from './code-highlighting.js';

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

// Draws linked code's text as its tokens, each kind marked for the stylesheet.
function drawLinkedCode(code: HTMLElement, node: ProseMirrorNode): void {
  const owner = code.ownerDocument;
  const text = codeText(node);
  const parts: Node[] = [];
  let offset = 0;
  for (const token of highlightCode(text, node.attrs.language)) {
    if (token.from > offset) parts.push(owner.createTextNode(text.slice(offset, token.from)));
    const span = owner.createElement('span');
    for (const [name, value] of Object.entries(codeTokenAttrs(token.kind))) {
      span.setAttribute(name, value);
    }
    span.textContent = text.slice(token.from, token.to);
    parts.push(span);
    offset = token.to;
  }
  if (offset < text.length) parts.push(owner.createTextNode(text.slice(offset)));
  code.replaceChildren(...parts);
}

// A code block as its markup draws it, with a gutter of line numbers before its code when asked,
// and linked code's text highlighted.
function codeView(node: ProseMirrorNode, view: EditorView, numbered: boolean): NodeView {
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
  if (numbered && pre && code) pre.insertBefore(gutter, code);
  if (code && node.type.name === 'linked_code_block') drawLinkedCode(code, node);
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

/** What the object views keep: the caption edited in place. */
interface ObjectViewsState {
  readonly caption: number | null;
}

const objectViewsKey = new PluginKey<ObjectViewsState>('object-views');

/** The captioned object whose caption is edited in place, which the editor draws its field over. */
export function captionEditingAt(state: EditorState): CaptionedObject | null {
  return captionEditingOf(objectViewsKey, state);
}

/** Edits the caption of the table, figure or code block at the selection in place. */
export const editCaption: Command = editCaptionOf(objectViewsKey);

/** Commits the caption edited in place with its text, shown; the object is selected after. */
export const commitCaptionEditing = (text: string): Command =>
  commitCaptionOf(objectViewsKey, text);

/** Stops editing a caption in place, leaving it as it is. */
export const cancelCaptionEditing: Command = cancelCaptionOf(objectViewsKey);

/**
 * Draws code with its line numbers and highlighted tokens (`highlightCode`), and signatures from
 * their vector, in every view, and keeps a
 * selected node that is not replaced on typing (`isReplacedOnType`) from the writer's typing.
 */
export function createObjectViews({
  lineNumbers: numbered = 'linked',
}: ObjectViewsOptions = {}): Plugin<ObjectViewsState> {
  const code = (node: ProseMirrorNode, view: EditorView) =>
    codeView(node, view, numbered === 'all');
  const linked = (node: ProseMirrorNode, view: EditorView) =>
    codeView(node, view, numbered !== 'none');
  const key = objectViewsKey;
  return new Plugin<ObjectViewsState>({
    key,
    state: {
      init: () => ({ caption: null }),
      apply: (tr, value) => ({ caption: updateCaptionEditing(key, tr, value.caption) }),
    },
    view: paintCodeHighlights,
    props: {
      decorations(state) {
        const editing = captionEditingDecorations(captionEditingAt(state));
        return editing.length ? DecorationSet.create(state.doc, editing) : undefined;
      },
      handleDOMEvents: { dblclick: captionDoubleClick(key) },
      handleTextInput: ({ state }) =>
        state.selection instanceof NodeSelection && !isReplacedOnType(state.selection.node),
      nodeViews: {
        signature: (node, view) => signatureView(node, view),
        linked_code_block: linked,
        ...(numbered === 'all' ? { code_block: code } : {}),
      },
    },
  });
}
