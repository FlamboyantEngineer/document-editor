// Where an undo or a redo takes the reader (DOCE-EDITING-2.11): the change it makes comes into view
// about a third of the way down the area that scrolls the document, and a change already in view
// scrolls nothing.

import type { Node } from 'prosemirror-model';
import { Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

// The documents an undo or a redo made, which the view then reveals as one.
const revealed = new WeakSet<Node>();

// How far down the area the change is brought.
const DOWN = 1 / 3;

/**
 * Marks a transaction as an undo's or a redo's: it scrolls to its selection, which
 * `revealHistoryChange` then brings a third of the way down the view. A transaction that changes
 * neither the document nor the selection, as a refused undo, is left as it is.
 */
export function revealingChange(tr: Transaction): Transaction {
  if (!tr.docChanged && !tr.selectionSet) return tr;
  revealed.add(tr.doc);
  return tr.scrollIntoView();
}

// The nearest ancestor that scrolls the view, else the window's own scrolling element.
function scrollerOf(view: EditorView): Element | null {
  const { ownerDocument } = view.dom;
  const owner = ownerDocument.defaultView;
  for (let at = view.dom.parentElement; at && owner; at = at.parentElement) {
    if (/auto|scroll/.test(owner.getComputedStyle(at).overflowY)) return at;
  }
  return ownerDocument.scrollingElement;
}

// The part of the window the scroller shows.
function frameOf(scroller: Element): { top: number; bottom: number } {
  const owner = scroller.ownerDocument;
  if (scroller === owner.scrollingElement) {
    return { top: 0, bottom: owner.defaultView?.innerHeight ?? scroller.clientHeight };
  }
  const { top } = scroller.getBoundingClientRect();
  return { top, bottom: top + scroller.clientHeight };
}

/**
 * Scrolls an undo's or a redo's change into view (a `handleScrollToSelection` prop): its selection
 * a third of the way down the area that scrolls the view, unless it shows there already. Any other
 * scroll is left to the view.
 */
export function revealHistoryChange(view: EditorView): boolean {
  const { doc, selection } = view.state;
  // Revealed once: a later scroll of the same document, as a caret moved by a key, is the view's.
  if (!revealed.delete(doc)) return false;
  const scroller = scrollerOf(view);
  if (!scroller) return false;
  const caret = view.coordsAtPos(selection.head);
  const frame = frameOf(scroller);
  if (caret.top >= frame.top && caret.bottom <= frame.bottom) return true;
  scroller.scrollTop += caret.top - (frame.top + (frame.bottom - frame.top) * DOWN);
  return true;
}

/** The plugin that brings an undo's or a redo's change into view (`revealHistoryChange`). */
export function createHistoryReveal(): Plugin {
  return new Plugin({
    key: new PluginKey('history-reveal'),
    props: { handleScrollToSelection: revealHistoryChange },
  });
}
