// What the reader's pointer does to the comments in the document itself: a primary mouse click
// back into the page puts a thread being started away, and a click on a thread's or a
// suggestion's text opens its card, as its marker does.

import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { isElement } from '../../utils/is-element.js';

/** The pointer events of the element holding the document, which the comments follow. */
export interface CommentPointer {
  /** A pointer pressed in the element holding the document. */
  down(event: ReactPointerEvent): void;
  /** A click in the element holding the document. */
  click(event: ReactMouseEvent): void;
}

// The document's own text: an element inside the editor's content, not a composer, the margin or
// other chrome around it.
function documentElementOf(target: EventTarget | null): Element | null {
  const element = isElement(target) ? target : null;
  return element?.closest('.de-document-editor__content') ? element : null;
}

/**
 * Whether a pointer press is a primary mouse click on the document's own text, which puts a thread
 * being started away; scrolling, other buttons, touch and pens, and presses outside the text keep
 * it.
 */
export function isPrimaryDocumentPress(event: ReactPointerEvent): boolean {
  return (
    event.button === 0 && event.pointerType === 'mouse' && documentElementOf(event.target) !== null
  );
}

/** The thread or suggestion whose text a click landed on: its id and the thread it names. */
export interface ClickedAnchor {
  readonly kind: 'comment' | 'suggestion';
  readonly id: string;
  /** For a suggestion, the thread its marks name. */
  readonly thread: string | null;
}

/** The innermost thread or suggestion whose text a click landed on; null for other text. */
export function clickedAnchor(target: EventTarget | null): ClickedAnchor | null {
  const element = documentElementOf(target);
  if (!element) return null;
  const anchor = element.closest('mark[data-comment-id], ins[data-id], del[data-id]');
  if (!anchor) {
    const split = element.closest('[data-suggestion-split-id]');
    const id = split?.getAttribute('data-suggestion-split-id');
    return id ? { kind: 'suggestion', id, thread: null } : null;
  }
  // A suggestion's text may name its thread too; it is the suggestion's card that opens.
  if (anchor.tagName.toLowerCase() === 'mark') {
    const id = anchor.getAttribute('data-comment-id');
    return id ? { kind: 'comment', id, thread: id } : null;
  }
  const id = anchor.getAttribute('data-id');
  return id ? { kind: 'suggestion', id, thread: anchor.getAttribute('data-comment-id') } : null;
}
