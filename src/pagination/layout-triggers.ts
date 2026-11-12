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

/** What the measuring view's content asks to measure again, gathered over a frame. */
export interface Remeasure {
  /** The elements that changed size, such as an image that loaded; their blocks measure again. */
  readonly targets: readonly Node[];
  /** Whether the content's width changed, so every block measures again. */
  readonly width: boolean;
}

/**
 * Measures again, once a frame, when the measuring view's content changes size after it was drawn:
 * math typeset or an image loaded or failed, naming the elements it came from, or the container's
 * width changed.
 */
export function remeasureOn(
  container: HTMLElement,
  remeasure: (change: Remeasure) => void,
): () => void {
  const owner = container.ownerDocument.defaultView;
  const due = { frame: false, targets: [] as Node[], width: false };
  const flush = () => {
    if (due.frame || !owner) return;
    due.frame = true;
    owner.requestAnimationFrame(() => {
      const change = { targets: due.targets, width: due.width };
      Object.assign(due, { frame: false, targets: [], width: false });
      remeasure(change);
    });
  };
  const listener = (event: Event) => {
    if (owner && event.target instanceof owner.Node) due.targets.push(event.target);
    flush();
  };
  const onImage = (event: Event) => {
    if ((event.target as Element | null)?.tagName === 'IMG') listener(event);
  };
  let width = container.getBoundingClientRect().width;
  const Observer = owner?.ResizeObserver;
  const observer = Observer
    ? new Observer(() => {
        const next = container.getBoundingClientRect().width;
        if (Math.abs(next - width) < 0.5) return;
        width = next;
        due.width = true;
        flush();
      })
    : null;
  observer?.observe(container);
  container.addEventListener(REMEASURE_EVENT, listener);
  container.addEventListener('load', onImage, true);
  container.addEventListener('error', onImage, true);
  return () => {
    observer?.disconnect();
    container.removeEventListener(REMEASURE_EVENT, listener);
    container.removeEventListener('load', onImage, true);
    container.removeEventListener('error', onImage, true);
  };
}
