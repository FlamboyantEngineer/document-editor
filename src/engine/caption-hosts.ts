// Table and figure captions edited in the caption itself: the caption text is its own editing host
// while the writer edits it, so a click puts the caret there, a double click selects a word and a
// press and drag selects text, as in any text. A press on the label puts the caret at the start of
// the text. What the writer types stays in the caption until Enter or focus leaving it commits it
// as the caption's text, one change; Escape puts the text back. Newlines typed or pasted become
// spaces, and Select All selects the caption's text only.

import { DOMSerializer, type Node as ProseMirrorNode } from 'prosemirror-model';
import { type EditorState, NodeSelection, type Transaction } from 'prosemirror-state';
import type { EditorView, NodeView } from 'prosemirror-view';
import { normalizeCaptionText } from '../model/index.js';
import { getComposedActiveElement } from '../utils/composed-focus.js';
import { isElement } from '../utils/is-element.js';
import { captionedAt } from './captions.js';

/** The captioned objects whose caption is edited in place in the caption itself. */
export const CAPTION_HOST_TYPES: readonly string[] = ['table', 'figure'];

const TEXT = '.doc-caption-text';
const LINE = '.doc-caption-line';

// The caption commits of the caption texts being edited, and how each caption text starts
// editing, by their element.
const commits = new WeakMap<Element, () => void>();
const starts = new WeakMap<Element, () => void>();

// The caption line holding an event's target or a changed node, or null.
function lineOf(target: EventTarget | Node | null): Element | null {
  if (isElement(target)) return target.closest(LINE);
  const parent = target && 'parentElement' in target ? (target as Node).parentElement : null;
  return parent ? parent.closest(LINE) : null;
}

/**
 * Commits the caption being edited in a view, if any: its text becomes the caption's, as when
 * focus leaves it. A save, a version or a comparison with another writer's state runs it first,
 * so the writer's typing is in what they read.
 */
export function commitCaptionDraft(view: EditorView): boolean {
  const active = getComposedActiveElement(view.dom.ownerDocument);
  const commit = active && view.dom.contains(active) ? commits.get(active) : undefined;
  commit?.();
  return Boolean(commit);
}

/**
 * Starts editing the caption of the table or figure at the selection in the caption itself, its
 * text selected; false when the object is of another kind or shows no caption.
 */
export function focusCaptionHost(
  view: EditorView,
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
): boolean {
  const found = captionedAt(state);
  if (!found || !CAPTION_HOST_TYPES.includes(found.node.type.name) || !view.editable) return false;
  const dom = view.nodeDOM(found.pos);
  const text = isElement(dom) ? dom.querySelector(`:scope > ${LINE} ${TEXT}`) : null;
  const begin = text ? starts.get(text) : undefined;
  if (!begin) return false;
  if (dispatch) begin();
  return true;
}

// Puts the caret at the start of an editing host.
function caretAtStart(text: HTMLElement): void {
  const selection = text.ownerDocument.getSelection();
  const range = text.ownerDocument.createRange();
  range.setStart(text, 0);
  range.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

// Puts text in place of an editing host's selection, newlines as spaces.
function insertPlain(text: HTMLElement, value: string): void {
  const plain = value.replace(/\s*[\r\n]+\s*/g, ' ');
  const owner = text.ownerDocument;
  const selection = owner.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  if (!range || !text.contains(range.commonAncestorContainer)) return;
  range.deleteContents();
  const node = owner.createTextNode(plain);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

interface Editing {
  readonly text: HTMLElement;
  readonly before: string;
}

interface CaptionOps {
  readonly view: EditorView;
  readonly ownLine: (target: EventTarget | Node | null) => Element | null;
  readonly start: (text: HTMLElement) => void;
  readonly leave: (keep: boolean) => void;
  readonly end: (keep: boolean) => void;
  readonly editing: () => Editing | null;
}

// The listeners of an object's caption text: a press starts editing, Enter and Escape end it,
// newlines are refused or pasted as spaces, and focus leaving commits.
function captionHandlers(ops: CaptionOps): Record<string, (event: Event) => void> {
  const { view, ownLine, start, leave, end, editing: current } = ops;
  return {
    mousedown(event) {
      const line = ownLine(event.target);
      const text = line?.querySelector<HTMLElement>(TEXT);
      if (!line || !text || !view.editable || (event as MouseEvent).button !== 0) return;
      start(text);
      if (isElement(event.target) && text.contains(event.target)) return;
      // A press on the label, or beside the text, puts the caret at the start of the text.
      event.preventDefault();
      text.focus();
      caretAtStart(text);
    },
    keydown(event) {
      const editing = current();
      const { key, ctrlKey, metaKey, altKey } = event as KeyboardEvent;
      if (!editing) return;
      // Select All selects the caption's text, never the document around it.
      if (key.toLowerCase() === 'a' && (ctrlKey || metaKey) && !altKey) {
        event.preventDefault();
        editing.text.ownerDocument.getSelection()?.selectAllChildren(editing.text);
      } else if (key === 'Enter' || key === 'Escape') {
        event.preventDefault();
        leave(key === 'Enter');
      }
    },
    beforeinput(event) {
      const { inputType } = event as InputEvent;
      if (inputType === 'insertParagraph' || inputType === 'insertLineBreak') {
        event.preventDefault();
      }
    },
    paste(event) {
      const editing = current();
      if (!editing) return;
      event.preventDefault();
      insertPlain(
        editing.text,
        (event as ClipboardEvent).clipboardData?.getData('text/plain') ?? '',
      );
    },
    focusout(event) {
      const editing = current();
      if (editing && event.target === editing.text) end(true);
    },
  };
}

// The editing of one object's caption text, in a view.
function captionEditor(view: EditorView, dom: HTMLElement, getPos: () => number | undefined) {
  let editing: Editing | null = null;
  const end = (keep: boolean) => {
    const current = editing;
    if (!current) return;
    editing = null;
    commits.delete(current.text);
    current.text.removeAttribute('contenteditable');
    current.text.removeAttribute('tabindex');
    if (!keep) current.text.textContent = current.before;
    const pos = getPos();
    const node = pos === undefined ? null : view.state.doc.nodeAt(pos);
    const caption = normalizeCaptionText(current.text.textContent);
    if (!keep || pos === undefined || !node || caption === node.attrs.caption) return;
    const attrs = { ...node.attrs, caption, captionEnabled: true };
    view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, attrs));
  };
  const start = (text: HTMLElement) => {
    if (editing?.text === text) return;
    editing = { text, before: text.textContent };
    text.setAttribute('contenteditable', 'true');
    // Focusable by a press beside it, and in documents that do not know editing hosts.
    text.setAttribute('tabindex', '-1');
    commits.set(text, () => {
      end(true);
    });
  };
  // Enter commits and Escape puts the text back; either way the object is selected after.
  const leave = (keep: boolean) => {
    end(keep);
    const pos = getPos();
    if (pos !== undefined) {
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
    }
    view.focus();
  };
  const ownLine = (target: EventTarget | Node | null) => {
    const line = lineOf(target);
    return line?.parentElement === dom ? line : null;
  };
  const handlers = captionHandlers({ view, ownLine, start, leave, end, editing: () => editing });
  for (const [type, handler] of Object.entries(handlers)) dom.addEventListener(type, handler);
  const text = dom.querySelector<HTMLElement>(`:scope > ${LINE} ${TEXT}`);
  if (text) {
    starts.set(text, () => {
      start(text);
      text.focus();
      text.ownerDocument.getSelection()?.selectAllChildren(text);
    });
  }
  return {
    isEditing: () => editing !== null,
    // Events in the caption line are the caption's own while the writer may edit it.
    owns: (event: Event) => view.editable && ownLine(event.target) !== null,
    ownLine,
    destroy: () => {
      if (editing) commits.delete(editing.text);
    },
  };
}

const sameAttrs = (a: ProseMirrorNode, b: ProseMirrorNode) =>
  JSON.stringify(a.attrs) === JSON.stringify(b.attrs);

interface Drawn {
  readonly dom: HTMLElement;
  readonly contentDOM: HTMLElement | null;
}

// Takes a new drawing's attributes and children onto the drawn object, but for its caption line,
// which the writer is editing, and its content, which the view keeps.
function patch(drawn: Drawn, fresh: Drawn): void {
  const { dom, contentDOM } = drawn;
  for (const { name } of [...dom.attributes]) {
    if (!fresh.dom.hasAttribute(name)) dom.removeAttribute(name);
  }
  for (const { name, value } of [...fresh.dom.attributes]) dom.setAttribute(name, value);
  const kept = (child: Element) =>
    child.matches(LINE) || Boolean(contentDOM && child.contains(contentDOM));
  const freshKept = (child: Element) =>
    child.matches(LINE) || Boolean(fresh.contentDOM && child.contains(fresh.contentDOM));
  const anchor = [...dom.children].find((child) => kept(child) && !child.matches(LINE)) ?? null;
  for (const child of [...dom.children]) if (!kept(child)) child.remove();
  for (const child of [...fresh.dom.children])
    if (!freshKept(child)) dom.insertBefore(child, anchor);
}

/**
 * The view of a table or figure as its markup draws it, with its caption text edited in place.
 * While the writer edits the caption, a change of the object's attributes, such as a column
 * resized by another writer, redraws all but the caption, so the editing goes on.
 */
export function captionHostView(
  node: ProseMirrorNode,
  view: EditorView,
  getPos: () => number | undefined,
): NodeView {
  const owner = view.dom.ownerDocument;
  const draw = (next: ProseMirrorNode): Drawn => {
    const spec = next.type.spec.toDOM?.(next);
    if (!spec) throw new Error(`${next.type.name} has no markup`);
    const { dom, contentDOM } = DOMSerializer.renderSpec(owner, spec);
    return { dom: dom as HTMLElement, contentDOM: (contentDOM as HTMLElement | undefined) ?? null };
  };
  const drawn = draw(node);
  const { dom, contentDOM } = drawn;
  const editor = captionEditor(view, dom, getPos);
  let current = node;
  return {
    dom,
    contentDOM: contentDOM ?? undefined,
    update(next) {
      if (next.type !== current.type) return false;
      if (!sameAttrs(next, current)) {
        if (!editor.isEditing()) return false;
        patch(drawn, draw(next));
      }
      current = next;
      return true;
    },
    stopEvent: (event) => editor.owns(event),
    // The caption line is drawn, and edited by the writer in place; only the content is the view's.
    ignoreMutation: (mutation) =>
      editor.ownLine(mutation.target) !== null ||
      (contentDOM ? !contentDOM.contains(mutation.target) : true),
    destroy: editor.destroy,
  };
}
