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
const EDITING_BOUNDARY =
  '[contenteditable=""], [contenteditable="true" i], [contenteditable="false" i], [contenteditable="plaintext-only" i]';

const isText = (node: Node | null): node is Text =>
  node !== null && node.nodeType === node.TEXT_NODE;

function editableRegion(node: Text): Element | null {
  const region = node.parentElement?.closest(EDITING_BOUNDARY);
  return region && !region.matches('[contenteditable="false" i]') ? region : null;
}

// The text after a node in its forced block, skipping separate editing hosts and locked widgets.
function textAfter(node: Text, block: Element): Text | null {
  const filter = block.ownerDocument.defaultView?.NodeFilter;
  if (!filter) return null;
  const walker = block.ownerDocument.createTreeWalker(
    block,
    filter.SHOW_ELEMENT | filter.SHOW_TEXT,
    (each) => {
      if (isText(each)) return filter.FILTER_ACCEPT;
      return (each as Element).matches(EDITING_BOUNDARY)
        ? filter.FILTER_REJECT
        : filter.FILTER_SKIP;
    },
  );
  walker.currentNode = node;
  const next = walker.nextNode();
  return isText(next) ? next : null;
}

// Where a caret at a DOM point is drawn at a forced line's end: the text after it, on the next
// line; null when it is not drawn at one. The point is at the end of the line's last text, which
// can sit in an element inside the line's end mark, such as a reserved box or a link.
function nextLineStart(view: EditorView, node: Node | null, offset: number) {
  if (!isText(node) || offset !== node.length) return null;
  if (!view.editable || !view.dom.contains(node)) return null;
  const end = node.parentElement?.closest(`.${END}`);
  if (!end) return null;
  const block = end.closest('.de-forced-lines');
  if (!block) return null;
  const editing = editableRegion(node);
  if (!editing) return null;
  const pos = view.posAtDOM(node, offset);
  // A line may start with an atom. Its displayed text is not an editable caret position, and the
  // editable text after the atom starts at a different document position.
  if (!view.state.doc.resolve(pos).nodeAfter?.isText) return null;
  const next = textAfter(node, block);
  // Text after it inside the end mark is still on this line.
  if (!next || end.contains(next) || editableRegion(next) !== editing) return null;
  return view.posAtDOM(next, 0) === pos ? { next, pos } : null;
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
    const atEnd = current.isCollapsed ? nextLineStart(view, anchorNode, anchorOffset) : null;
    atLineEnd = atEnd?.pos ?? null;
  };
  document.addEventListener('selectionchange', watch);
  return {
    update(updated) {
      const { empty, head } = updated.state.selection;
      const current = selection();
      if (!empty || !current?.isCollapsed || atLineEnd === head || !updated.hasFocus()) return;
      const start = nextLineStart(updated, current.anchorNode, current.anchorOffset);
      if (start?.pos !== head) return;
      current.collapse(start.next, 0);
      (updated as unknown as ObservedView).domObserver?.setCurSelection();
    },
    destroy: () => document.removeEventListener('selectionchange', watch),
  };
}
