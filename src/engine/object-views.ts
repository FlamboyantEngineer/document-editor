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
  TextSelection,
} from 'prosemirror-state';
import type { Decoration, EditorView, NodeView, NodeViewConstructor } from 'prosemirror-view';
import type { LineTable } from '../layout-engine/line-table.js';
import { normalizeSignatureVector } from '../model/index.js';
import { firstRowColumnWidths } from '../model/schema/object-layout.js';
import { isElement } from '../utils/is-element.js';
import { editCaptionText, selectFigureOnImage } from './caption-editing.js';
import { firstCodeLine, gutterText } from './code-drawing.js';
import { drawGutter, forcedLinesIn } from './code-gutter.js';
import { paintCodeHighlights } from './code-highlighting.js';
import { drawLinkedCode } from './linked-code.js';

/** The line numbers of a code text, from its first line's number, one per line. */
export function lineNumbers(code: string, first = 1): string {
  const count = code.split('\n').length;
  return Array.from({ length: count }, (_, index) => String(first + index)).join('\n');
}

const sameAttrs = (a: ProseMirrorNode, b: ProseMirrorNode) =>
  JSON.stringify(a.attrs) === JSON.stringify(b.attrs);

// A code block as its markup draws it, with a gutter of line numbers before its code when asked,
// and linked code's text highlighted.
function codeView(
  node: ProseMirrorNode,
  view: EditorView,
  drawing: { numbered: boolean; decorations: readonly Decoration[] },
): NodeView {
  const { numbered } = drawing;
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
  // Linked code's caption line is drawn from its address, beside the code it labels.
  pre
    ?.querySelector(':scope > .doc-linked-code-caption-line')
    ?.setAttribute('contenteditable', 'false');
  let current = node;
  // Linked code's text is drawn from its attributes, again when the lines it is drawn on change.
  let drawnOn: LineTable | null | undefined;
  const draw = (next: ProseMirrorNode, decorations: readonly Decoration[]) => {
    current = next;
    const lines = forcedLinesIn(decorations);
    if (code && next.type.name === 'linked_code_block' && lines !== drawnOn)
      drawLinkedCode(code, next, lines);
    drawnOn = lines;
    if (numbered) drawGutter(gutter, gutterText(next), { first: firstCodeLine(next), lines });
  };
  draw(node, drawing.decorations);
  return {
    dom,
    contentDOM: contentDOM ?? undefined,
    update(next, decorations) {
      // Another type, or other attributes such as another language, draws the block again.
      if (next.type !== current.type || !sameAttrs(next, current)) return false;
      draw(next, decorations);
      return true;
    },
    // Only the code's own text is the document's; the gutter and the caption line are drawn.
    ignoreMutation: (mutation) => !contentDOM || !contentDOM.contains(mutation.target),
  };
}

function sameTableColumns(previous: ProseMirrorNode, next: ProseMirrorNode): boolean {
  if (previous.firstChild === next.firstChild) return true;
  const widths = firstRowColumnWidths(previous);
  const latest = firstRowColumnWidths(next);
  return widths.length === latest.length && widths.every((width, index) => width === latest[index]);
}

// Updates the sizing drawn outside the rows, which must keep their DOM for the caret.
function updateTableColumns(table: HTMLTableElement, sized: HTMLTableElement): void {
  table.style.width = sized.style.width;
  table.style.maxWidth = sized.style.maxWidth;
  const sizing = sized.getAttribute('data-table-columns');
  if (sizing === null) table.removeAttribute('data-table-columns');
  else table.setAttribute('data-table-columns', sizing);
  const columns = sized.querySelector(':scope > colgroup');
  if (columns) table.querySelector(':scope > colgroup')?.replaceWith(columns);
}

// A table as its markup draws it, with its kept widths refreshed after any drag preview.
function tableView(node: ProseMirrorNode, view: EditorView): NodeView {
  const { toDOM } = node.type.spec;
  if (!toDOM) throw new Error(`${node.type.name} has no markup`);
  const owner = view.dom.ownerDocument;
  const { dom, contentDOM } = DOMSerializer.renderSpec(owner, toDOM(node));
  let current = node;
  return {
    dom,
    contentDOM: contentDOM ?? undefined,
    update(next) {
      if (next.type !== current.type || !sameAttrs(next, current)) return false;
      if (!sameTableColumns(current, next)) {
        const { dom: sized } = DOMSerializer.renderSpec(owner, toDOM(next));
        if (
          !isElement(dom) ||
          dom.tagName !== 'TABLE' ||
          !isElement(sized) ||
          sized.tagName !== 'TABLE'
        )
          return false;
        updateTableColumns(dom as HTMLTableElement, sized as HTMLTableElement);
      }
      current = next;
      return true;
    },
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

// The code element of the typed code block a press is on, beside its text: in the code's box or in
// the box holding it with its caption, outside the caption; null for anything else.
function pressedCode(target: Element): Element | null {
  const holder = target.closest('.doc-code-figure');
  if (holder && target.closest('.doc-caption-line')) return null;
  const pre = target.closest('pre') ?? holder?.querySelector(':scope > pre');
  if (!pre || pre.closest('[data-linked-code-block]')) return null;
  return pre.querySelector(':scope > code');
}

// A press on a code block's padding, outside its text, puts the caret at the code position nearest
// to it, as a press on the gutter does, so it never lands beside the block. Its caption is text,
// pressed as any text is; linked code, which takes no caret, and double presses are left alone.
function codePress(view: EditorView, event: MouseEvent): boolean {
  if (event.button !== 0 || event.detail > 1 || !view.editable) return false;
  const target = isElement(event.target) ? event.target : null;
  const code = target && pressedCode(target);
  if (!code || code.contains(target) || !view.dom.contains(code)) return false;
  const box = code.getBoundingClientRect();
  const left = Math.min(Math.max(event.clientX, box.left + 1), box.right - 1);
  const top = Math.min(Math.max(event.clientY, box.top + 1), box.bottom - 1);
  const found = view.posAtCoords({ left, top });
  if (!found) return false;
  const $pos = view.state.doc.resolve(found.pos);
  if ($pos.parent.type.name !== 'code_block') return false;
  event.preventDefault();
  view.focus();
  const anchor = found.pos;
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, anchor)));
  followDrag(view, anchor);
  return true;
}

// Extends the selection from an anchor to the text under the pointer until the button is released,
// as a native drag would have from a press in the text.
function followDrag(view: EditorView, anchor: number): void {
  const owner = view.dom.ownerDocument;
  const move = (event: MouseEvent) => {
    const head = view.posAtCoords({ left: event.clientX, top: event.clientY });
    if (!head || anchor > view.state.doc.content.size) return;
    const selection = TextSelection.between(
      view.state.doc.resolve(anchor),
      view.state.doc.resolve(head.pos),
    );
    if (!selection.eq(view.state.selection)) view.dispatch(view.state.tr.setSelection(selection));
  };
  const stop = () => {
    owner.removeEventListener('mousemove', move);
    owner.removeEventListener('mouseup', stop);
  };
  owner.addEventListener('mousemove', move);
  owner.addEventListener('mouseup', stop);
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
  /** Which code shows line numbers: all of it (the default), linked code only, or none. */
  readonly lineNumbers?: LineNumbers | undefined;
}

const objectViewsKey = new PluginKey('object-views');

/**
 * Which code an editor state's object views draw with line numbers (`createObjectViews`); none
 * when the state has no object views. A layout that sizes code without the DOM reads it, since the
 * gutter takes the code's width.
 */
export function codeLineNumbers(state: EditorState): LineNumbers {
  const plugin = state.plugins.find((each) => each.spec.key === objectViewsKey);
  const numbered = (plugin?.spec as { lineNumbers?: LineNumbers } | undefined)?.lineNumbers;
  return numbered ?? 'none';
}

/**
 * Edits the caption of the table, figure or code block at the selection in place, as text, its
 * text selected.
 */
export const editCaption: Command = editCaptionText;

/**
 * Draws code with its line numbers and highlighted tokens (`highlightCode`), and signatures from
 * their vector, in every view, and keeps a
 * selected node that is not replaced on typing (`isReplacedOnType`) from the writer's typing.
 */
export function createObjectViews({
  lineNumbers: numbered = 'all',
}: ObjectViewsOptions = {}): Plugin {
  // A code view, given the decorations its element is drawn with, which carry its forced lines.
  const codeViews =
    (lined: boolean): NodeViewConstructor =>
    (...[node, view, , decorations]) =>
      codeView(node, view, { numbered: lined, decorations });
  const code = codeViews(numbered === 'all');
  const linked = codeViews(numbered !== 'none');
  return new Plugin({
    key: objectViewsKey,
    lineNumbers: numbered,
    view: paintCodeHighlights,
    props: {
      handleDOMEvents: { mousedown: codePress },
      handleClickOn: selectFigureOnImage,
      handleTextInput: ({ state }) =>
        state.selection instanceof NodeSelection && !isReplacedOnType(state.selection.node),
      nodeViews: {
        table: (node, view) => tableView(node, view),
        signature: (node, view) => signatureView(node, view),
        linked_code_block: linked,
        ...(numbered === 'all' ? { code_block: code } : {}),
      },
    },
  });
}
