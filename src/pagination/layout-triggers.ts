// When an editor's pagination lays out besides a change of the content itself: the writer pausing
// after edits, the first paint and the host's font faces settling. Nothing drawn asks for a layout:
// every size comes from the layout engine.

import type { EditorView } from 'prosemirror-view';
import type { PagedProjectionOptions } from './projection.js';
import type { TextEngineHolder } from './text-engine-holder.js';

// What ends a press on the editor.
const RELEASES = ['mouseup', 'dragend', 'drop', 'blur'] as const;

/**
 * Holds an edit's layout until the writer pauses for `settle` milliseconds, at most four times as
 * long after the first edit, and until no pointer button is down on the editor, so a layout never
 * lands in the middle of a drag; then asks for it.
 */
export function settleEdits(
  options: Pick<PagedProjectionOptions, 'element' | 'settle'>,
  request: () => void,
) {
  const settle = options.settle ?? 150;
  const owner = options.element.ownerDocument.defaultView;
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
export function awaitReady(
  ready: PromiseLike<unknown> | undefined,
  settled: () => void,
  failed = settled,
) {
  let waiting = Boolean(ready);
  const done = (notify: () => void) => () => {
    if (!waiting) return;
    waiting = false;
    notify();
  };
  if (ready) void Promise.resolve(ready).then(done(settled), done(failed));
  return { waiting: () => waiting };
}

/** Waits for the layout engine still loading, which can fail. */
export function awaitLayoutInputs(
  text: TextEngineHolder | null,
  { settled, failed }: { settled: () => void; failed: () => void },
) {
  if (!text) return { blocked: () => true, failed: () => true };
  const engine =
    text.engine() === null
      ? text.loaded.then(() => {
          if (!text.engine()) throw new Error('The page layout engine is unavailable.');
        })
      : undefined;
  if (!engine) return { blocked: () => false, failed: () => false };
  let unavailable = false;
  const waiting = awaitReady(engine, settled, () => {
    unavailable = true;
    failed();
  });
  return { blocked: () => unavailable || waiting.waiting(), failed: () => unavailable };
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

// The views whose composition's end a layout waits for.
const composing = new WeakSet<EditorView>();

/**
 * Runs `ended` once the view's composition ends, however often a layout asks while it lasts, so
 * nothing is scheduled frame after frame meanwhile; a composition the browser dropped is ended by
 * `redrawRefused`.
 */
export function afterComposition(view: EditorView, ended: () => void): void {
  if (composing.has(view)) return;
  composing.add(view);
  const end = () => {
    composing.delete(view);
    ended();
  };
  view.dom.addEventListener('compositionend', end, { once: true });
}
