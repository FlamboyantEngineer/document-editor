// The side a caret at a forced line's start is drawn on (DOCE-PAGINATION-11.7). The last character
// of a forced line and the first of the next meet at one position, which the browser can draw at
// the line's end or at the next line's start. For its own wraps the browser draws it at the next
// line's start, unless it was put at the line's end (End, or a click past the end). ProseMirror
// keeps no side: when it writes the selection, after an edit or once the DOM under it is drawn
// again, it puts such a caret after the text before it, at the line above's end, and a vertical
// move from there loses its column. This draws it the browser's way.

import type { EditorView } from 'prosemirror-view';

/** Keeps a view's caret on the browser's side of its forced line starts. */
interface ForcedCaret {
  /** Draws the caret at the next line's start after the view wrote it at a line's end. */
  update(view: EditorView): void;
  destroy(): void;
}

const END = 'de-forced-lines__end';

// The text after a node in its forced block, in document order.
function textAfter(node: Node, block: Element): Text | null {
  const walker = block.ownerDocument.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  walker.currentNode = node;
  return walker.nextNode() as Text | null;
}

// Where a caret at a DOM point is drawn at a forced line's end: the text after it, on the next
// line; null when it is not drawn at one.
function nextLineStart(node: Node | null, offset: number): Text | null {
  if (!(node instanceof Text) || offset !== node.length) return null;
  if (!node.parentElement?.classList.contains(END)) return null;
  const block = node.parentElement.closest('.de-forced-lines');
  return block ? textAfter(node, block) : null;
}

// The view's own selection, which ProseMirror reads back without a change.
interface ObservedView {
  readonly domObserver?: { setCurSelection(): void };
}

/** Watches where the browser draws a view's caret, and corrects where the view writes it. */
export function keepForcedCaret(view: EditorView): ForcedCaret {
  const document = view.dom.ownerDocument;
  // The position the browser last drew at a line's end, where the writer put it.
  let atLineEnd: number | null = null;
  const selection = () => (view.root === document ? document.getSelection() : null);
  const watch = () => {
    const current = selection();
    if (!current?.anchorNode || !view.dom.contains(current.anchorNode)) return;
    const { anchorNode, anchorOffset } = current;
    const atEnd = current.isCollapsed && nextLineStart(anchorNode, anchorOffset);
    atLineEnd = atEnd ? view.posAtDOM(anchorNode, anchorOffset) : null;
  };
  document.addEventListener('selectionchange', watch);
  return {
    update(updated) {
      const { empty, head } = updated.state.selection;
      const current = selection();
      if (!empty || !current?.isCollapsed || atLineEnd === head || !updated.hasFocus()) return;
      const next = nextLineStart(current.anchorNode, current.anchorOffset);
      if (!next) return;
      current.collapse(next, 0);
      (updated as unknown as ObservedView).domObserver?.setCurSelection();
    },
    destroy: () => document.removeEventListener('selectionchange', watch),
  };
}
