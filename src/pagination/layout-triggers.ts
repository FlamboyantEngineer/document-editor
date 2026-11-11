// What asks an editor's pagination for a layout besides a change of the content itself: the
// writer pausing after edits, and the measuring view's content changing size after it was drawn.

import type { EditorView } from 'prosemirror-view';
import { REMEASURE_EVENT } from '../utils/remeasure.js';
import type { PaginationOptions } from './pagination.js';

/**
 * Holds an edit's layout until the writer pauses for `settle` milliseconds, at most four times as
 * long after the first edit, and until no pointer button is down on the editor, so a layout never
 * lands in the middle of a drag; then asks for it.
 */
export function settleEdits(options: PaginationOptions, request: () => void) {
  const settle = options.settle ?? 150;
  const owner = options.measureIn.ownerDocument.defaultView;
  const edits = { first: 0, last: 0, timer: null as number | null, pressed: false };
  const now = () => owner?.performance.now() ?? 0;
  const press = () => {
    edits.pressed = true;
  };
  const release = () => {
    if (!edits.pressed) return;
    edits.pressed = false;
    if (edits.timer === null && edits.first > 0) check();
  };
  function check() {
    const at = now();
    const quiet = at - edits.last >= settle || at - edits.first >= settle * 4;
    if (!quiet) wait(Math.min(settle - (at - edits.last), settle * 4 - (at - edits.first)));
    else if (!edits.pressed) {
      edits.first = 0;
      request();
    }
  }
  function wait(delay: number) {
    edits.timer =
      owner?.setTimeout(() => {
        edits.timer = null;
        check();
      }, delay) ?? null;
  }
  const cancel = () => {
    if (edits.timer !== null) owner?.clearTimeout(edits.timer);
    Object.assign(edits, { first: 0, timer: null });
  };
  return {
    /** Starts following the pointer on the editor; returns how to stop. */
    watch(editor: EditorView) {
      editor.dom.addEventListener('mousedown', press);
      owner?.addEventListener('mouseup', release);
      return () => {
        editor.dom.removeEventListener('mousedown', press);
        owner?.removeEventListener('mouseup', release);
        cancel();
      };
    },
    request() {
      if (settle <= 0 || !owner) {
        request();
        return;
      }
      edits.last = now();
      if (edits.first === 0) edits.first = edits.last;
      if (edits.timer === null) wait(settle);
    },
    cancel,
    /** Whether an edit waits for its layout. */
    waiting: () => edits.first > 0,
  };
}

/**
 * Measures again, once a frame, when the measuring view's content changes size after it was drawn:
 * math typeset or an image loaded.
 */
export function remeasureOn(container: HTMLElement, remeasure: () => void): () => void {
  const owner = container.ownerDocument.defaultView;
  let due = false;
  const listener = () => {
    if (due || !owner) return;
    due = true;
    owner.requestAnimationFrame(() => {
      due = false;
      remeasure();
    });
  };
  const onLoad = (event: Event) => {
    if ((event.target as Element | null)?.tagName === 'IMG') listener();
  };
  container.addEventListener(REMEASURE_EVENT, listener);
  container.addEventListener('load', onLoad, true);
  return () => {
    container.removeEventListener(REMEASURE_EVENT, listener);
    container.removeEventListener('load', onLoad, true);
  };
}
