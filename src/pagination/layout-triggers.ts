// What asks an editor's pagination for a layout besides a change of the content itself: the
// writer pausing after edits, and the measuring view's content changing size after it was drawn.

import type { EditorView } from 'prosemirror-view';
import { REMEASURE_EVENT } from '../utils/remeasure.js';
import { forgetMeasurement, type MeasureCache } from './measure-blocks.js';
import type { PagedProjectionOptions } from './projection.js';

// What ends a press on the editor.
const RELEASES = ['mouseup', 'dragend', 'drop', 'blur'] as const;

/**
 * Holds an edit's layout until the writer pauses for `settle` milliseconds, at most four times as
 * long after the first edit, and until no pointer button is down on the editor, so a layout never
 * lands in the middle of a drag; then asks for it.
 */
export function settleEdits(
  options: Pick<PagedProjectionOptions, 'measureIn' | 'settle'>,
  request: () => void,
) {
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
      // A native drag ends with no mouseup, and a press may end in another window: the window's own
      // blur, which an element's blur does not reach, as it does not bubble.
      for (const event of RELEASES) owner?.addEventListener(event, release);
      return () => {
        editor.dom.removeEventListener('mousedown', press);
        for (const event of RELEASES) owner?.removeEventListener(event, release);
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
  /** Whether the content's width changed or font faces loaded, so every block measures again. */
  readonly all: boolean;
}

/**
 * Measures again, once a frame, when the measuring view's content changes size after it was drawn:
 * math typeset or an image loaded or failed, naming the elements it came from, or the container's
 * width changed or font faces loaded in its document.
 */
export function remeasureOn(
  container: HTMLElement,
  remeasure: (change: Remeasure) => void,
): () => void {
  const owner = container.ownerDocument.defaultView;
  const due = { frame: false, targets: [] as Node[], all: false };
  const flush = () => {
    if (due.frame || !owner) return;
    due.frame = true;
    owner.requestAnimationFrame(() => {
      const change = { targets: due.targets, all: due.all };
      Object.assign(due, { frame: false, targets: [], all: false });
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
        due.all = true;
        flush();
      })
    : null;
  observer?.observe(container);
  const fonts = container.ownerDocument.fonts as FontFaceSet | undefined;
  const onFonts = () => {
    due.all = true;
    flush();
  };
  fonts?.addEventListener('loadingdone', onFonts);
  container.addEventListener(REMEASURE_EVENT, listener);
  container.addEventListener('load', onImage, true);
  container.addEventListener('error', onImage, true);
  return () => {
    observer?.disconnect();
    fonts?.removeEventListener('loadingdone', onFonts);
    container.removeEventListener(REMEASURE_EVENT, listener);
    container.removeEventListener('load', onImage, true);
    container.removeEventListener('error', onImage, true);
  };
}

/**
 * Forgets what a remeasure asks for: every block after a width change or loaded fonts, otherwise
 * the blocks of the elements that changed size in the view `measuring`.
 */
export function forgetRemeasured(
  cache: MeasureCache,
  measuring: EditorView | null,
  change: Remeasure,
): void {
  if (change.all || !measuring) cache.clear();
  else for (const target of change.targets) forgetMeasurement(cache, measuring, target);
}

/** Runs on the next animation frame of the window an element is in: a layout's default schedule. */
export function frameIn(container: HTMLElement): (run: () => void) => () => void {
  const owner = container.ownerDocument.defaultView;
  return (run) => {
    if (!owner) return () => undefined;
    const handle = owner.requestAnimationFrame(run);
    return () => owner.cancelAnimationFrame(handle);
  };
}

/**
 * Follows what the pages' measurements wait for, such as the host's font faces: whether it is
 * still due, and a call once it settles, loaded or not.
 */
export function awaitReady(ready: PromiseLike<unknown> | undefined, settled: () => void) {
  let waiting = Boolean(ready);
  const done = () => {
    if (!waiting) return;
    waiting = false;
    settled();
  };
  ready?.then(done, done);
  return { waiting: () => waiting };
}

/**
 * Runs before the window an element is in next paints, in a microtask, and returns how to cancel
 * it: the schedule for a first layout, so the first paint already shows the pages.
 */
export function beforePaintIn(container: HTMLElement): (run: () => void) => () => void {
  const owner = container.ownerDocument.defaultView;
  return (run) => {
    let cancelled = false;
    owner?.queueMicrotask(() => {
      if (!cancelled) run();
    });
    return () => {
      cancelled = true;
    };
  };
}
