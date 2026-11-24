// The browser reports a click's or a key's new caret a moment after it moves, and ProseMirror reads
// it then. A state committed before that draws the old selection back over the new caret, so
// whatever commits a state the writer did not make, such as a layout or proofing results, first
// has the view read the selection the browser shows.

import { Selection as EditorSelection } from 'prosemirror-state';
import type { DirectEditorProps, EditorView } from 'prosemirror-view';

// The view's reader of DOM changes, which ProseMirror keeps internal.
interface ObservedView {
  readonly domObserver?: { flush(): void };
}

/** Has the view take the selection and changes the browser shows but has not reported yet. */
export function readDomSelection(view: EditorView): void {
  if (view.composing || view.isDestroyed) return;
  (view as unknown as ObservedView).domObserver?.flush();
}

type DomHandlers = NonNullable<DirectEditorProps['handleDOMEvents']>;

// The parts of the view that ProseMirror keeps internal and its focus handling sets.
interface FocusedView {
  focused: boolean;
  readonly domObserver?: {
    stop(): void;
    start(): void;
    readonly currentSelection: { eq(selection: Selection): boolean };
  };
  domSelectionRange(): Selection;
}

// Per view, by its element, so wrapping the handlers again or seeing the view through another
// (such as the canonical view over the pages) shares it: whether input came since a press on the
// view outside focus, or since focus.
const noted = new WeakMap<Element, { input: boolean }>();

const note = (view: EditorView) => {
  const at = noted.get(view.dom);
  if (at) at.input = true;
};

// A press on the view outside focus, noted until the focus it brings, which comes in the same
// task, or until the task ends.
function pressBeforeFocus(view: EditorView): void {
  const pressed = { input: true };
  noted.set(view.dom, pressed);
  view.dom.ownerDocument.defaultView?.setTimeout(() => {
    if (noted.get(view.dom) === pressed) noted.delete(view.dom);
  }, 0);
}

// Whether the browser shows no selection of its own in the view as it takes focus: none, one
// outside it, or a caret at the content's start or before it, where it puts one in an editable
// element focused with no selection in it.
function showsNoSelection(view: EditorView): boolean {
  const shown = (view as unknown as FocusedView).domSelectionRange();
  const { anchorNode, anchorOffset } = shown;
  if (!anchorNode || !view.dom.contains(anchorNode)) return true;
  if (anchorNode !== shown.focusNode || anchorOffset !== shown.focusOffset) return false;
  const first = EditorSelection.findFrom(view.state.doc.resolve(0), 1, true);
  try {
    return first !== null && view.posAtDOM(anchorNode, anchorOffset) <= first.from;
  } catch {
    return false;
  }
}

// Takes focus as ProseMirror does, so that its own check of the selection does not run, and runs
// one check in its place twenty milliseconds on. A focus with no input where the browser shows no
// selection of its own, as one a dialog hands back, draws the view's selection at once:
// ProseMirror's own guard misses a document that opens with a selectable block, and a layout drawn
// or a selection change reported before the check would otherwise take that place for the writer's.
function takeFocus(view: EditorView): void {
  const own = view as unknown as FocusedView;
  const observer = own.domObserver;
  if (own.focused || !observer) return;
  // A press on the view that brings focus is the writer's input, as a later click or key is.
  const focusing = { input: noted.get(view.dom)?.input === true };
  noted.set(view.dom, focusing);
  observer.stop();
  view.dom.classList.add('ProseMirror-focused');
  observer.start();
  own.focused = true;
  if (!focusing.input && showsNoSelection(view)) view.focus();
  view.dom.ownerDocument.defaultView?.setTimeout(() => {
    if (noted.get(view.dom) === focusing) noted.delete(view.dom);
    if (view.isDestroyed || !view.hasFocus()) return;
    if (focusing.input) readDomSelection(view);
    else if (!observer.currentSelection.eq(own.domSelectionRange())) view.focus();
  }, 20);
}

// A point of the browser's selection.
interface DomPoint {
  readonly node: Node;
  readonly offset: number;
}

// The selection the browser shows in the view, when the view has not read it yet; null otherwise.
function unreadSelection(view: EditorView): { anchor: DomPoint; focus: DomPoint } | null {
  const own = view as unknown as FocusedView;
  if (view.composing || !own.domObserver || !view.hasFocus()) return null;
  const shown = own.domSelectionRange();
  const { anchorNode, focusNode } = shown;
  if (own.domObserver.currentSelection.eq(shown) || !anchorNode || !focusNode) return null;
  return {
    anchor: { node: anchorNode, offset: shown.anchorOffset },
    focus: { node: focusNode, offset: shown.focusOffset },
  };
}

/**
 * Draws a state the writer did not make, such as new pages, keeping a selection the browser shows
 * and the view has not read yet, as a click's caret between the press and its report
 * (DOCE-PAGINATION-7.24). Drawing the state puts the view's selection on the page; the browser's
 * comes back where its text is still drawn, and the view reads it.
 */
export function drawKeepingSelection(view: EditorView, draw: () => void): void {
  const unread = unreadSelection(view);
  draw();
  if (!unread || view.isDestroyed) return;
  const { anchor, focus } = unread;
  if (!view.dom.contains(anchor.node) || !view.dom.contains(focus.node)) return;
  view.dom.ownerDocument
    .getSelection()
    ?.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
  readDomSelection(view);
}

/**
 * Wraps a view's focus, mouse-down and key-down handlers to keep a click or key that follows focus
 * closely (DOCE-PAGINATION-7.22, 7.24). Twenty milliseconds after the view takes focus,
 * ProseMirror draws its own selection back over a different one the browser shows, so that focus
 * from outside keeps the writer's place. On a busy page that check comes after a key the browser
 * has already acted on but not yet reported, and undoes it. So the view takes focus here, with
 * nothing scheduled by ProseMirror, and one check runs in its place: when a press on the view
 * brought focus or input came after it, the view reads the browser's selection; otherwise it draws
 * its own, as ProseMirror would.
 */
export function keepInputAfterFocus(handlers: DomHandlers | undefined): DomHandlers {
  return {
    focus(view, event) {
      takeFocus(view);
      return handlers?.focus?.(view, event) === true;
    },
    mousedown(view, event) {
      if ((view as unknown as FocusedView).focused) note(view);
      else pressBeforeFocus(view);
      return handlers?.mousedown?.(view, event) === true;
    },
    keydown(view, event) {
      note(view);
      return handlers?.keydown?.(view, event) === true;
    },
  };
}
