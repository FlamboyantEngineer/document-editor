// The proofing plugin's view: it checks the document's unchecked text a short while after it
// changes, one check at a time, with every proofer, in batches a proofer takes at once and long
// blocks in segments. A check the document outran is aborted, and the next one starts from the new
// text; results wait while a pointer button is down, so they never redraw a selection being made.
// While the editor is not editable, or the host turns proofing off, nothing is checked.

import type { PluginView } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { readDomSelection } from '../utils/dom-selection.js';
import { proofingKey, type ProofingOptions, uncheckedBlocks } from './proofing.js';
import { checkProofingBlocks, selectProofingBlocks } from './proofing-batches.js';

// Whether a pointer button is down on the view: results committed during a drag would draw the
// selection the drag started from back over it, so they wait for the release and for the view to
// take it.
function pointerOn(view: EditorView) {
  const owner = view.dom.ownerDocument.defaultView;
  let pressed = false;
  let waiting: (() => void)[] = [];
  const press = () => {
    pressed = true;
  };
  const release = () => {
    if (!pressed) return;
    pressed = false;
    owner?.setTimeout(() => {
      const resolved = waiting;
      waiting = [];
      for (const resolve of resolved) resolve();
    }, 0);
  };
  // A native drag ends with dragend or drop, and no mouseup; a press may also end out of the window.
  const ends = ['mouseup', 'dragend', 'drop', 'blur'] as const;
  view.dom.addEventListener('mousedown', press);
  for (const end of ends) owner?.addEventListener(end, release, true);
  return {
    released: () =>
      pressed ? new Promise<void>((resolve) => waiting.push(resolve)) : Promise.resolve(),
    destroy() {
      view.dom.removeEventListener('mousedown', press);
      for (const end of ends) owner?.removeEventListener(end, release, true);
      for (const resolve of waiting) resolve();
    },
  };
}

// Whether a view's document is proofed now: it is editable, and the host has proofing on.
const enabledIn = (view: EditorView, options: ProofingOptions) =>
  view.editable && (options.isEnabled?.(view.state) ?? true);

// Tells a view's state whether its document is proofed, once the view's update is over.
function publishEnabled(view: EditorView, enabled: boolean) {
  queueMicrotask(() => {
    const proofing = proofingKey.getState(view.state);
    if (view.isDestroyed || !proofing || proofing.enabled === enabled) return;
    view.dispatch(view.state.tr.setMeta(proofingKey, { enabled }).setMeta('addToHistory', false));
  });
}

/** Checks a view's document with the plugin's proofers. */
export function proofingView(view: EditorView, options: ProofingOptions): PluginView {
  const owner = view.dom.ownerDocument.defaultView;
  const pointer = pointerOn(view);
  let timer: number | null = null;
  let running: AbortController | null = null;
  let enabled = enabledIn(view, options);
  let refresh = false;

  function clear() {
    if (timer !== null) owner?.clearTimeout(timer);
    timer = null;
  }

  function restart(delay: number) {
    running?.abort();
    running = null;
    schedule(delay);
  }

  function schedule(delay: number) {
    clear();
    timer =
      owner?.setTimeout(() => {
        timer = null;
        void run();
      }, delay) ?? null;
  }

  async function run() {
    const proofing = proofingKey.getState(view.state);
    if (!enabled || !proofing || running || view.isDestroyed) return;
    const blocks = selectProofingBlocks(uncheckedBlocks(view.state), options);
    if (blocks.length === 0 && (!refresh || proofing.results.size === 0)) return;
    const controller = new AbortController();
    running = controller;
    const answer =
      blocks.length > 0
        ? await checkProofingBlocks(blocks, {
            proofers: proofing.proofers,
            signal: controller.signal,
            limits: options,
          })
        : { results: new Map(), status: proofing.status, reason: proofing.reason };
    await pointer.released();
    if (running === controller) running = null;
    if (controller.signal.aborted || view.isDestroyed) return;
    refresh = false;
    readDomSelection(view);
    const meta = { ...answer, generation: proofing.generation };
    view.dispatch(view.state.tr.setMeta(proofingKey, meta).setMeta('addToHistory', false));
    // More text than one check takes is checked next.
    if (blocks.length > 0) schedule(0);
  }

  // The first check waits for the host, or as long as one after a change, so it does not slow the
  // editor's start. Until the host runs it, changes, such as the pages laid out, wait for it too.
  let waitingForHost = false;
  const cancelFirst = options.scheduleFirstCheck?.(() => {
    waitingForHost = false;
    void run();
  });
  waitingForHost = Boolean(cancelFirst);
  if (!cancelFirst) schedule(options.delay ?? 500);
  if (!enabled) publishEnabled(view, enabled);
  return {
    update(next, previous) {
      const was = enabled;
      enabled = enabledIn(next, options);
      const proofing = proofingKey.getState(next.state);
      if (proofing?.enabled !== enabled) publishEnabled(next, enabled);
      const changed = !next.state.doc.eq(previous.doc);
      refresh ||= changed;
      // Turned off, a running check is dropped; turned on, and on a new start, every text not
      // checked yet is checked now.
      if (was !== enabled || proofing?.generation !== proofingKey.getState(previous)?.generation) {
        return restart(0);
      }
      if (!enabled || !changed || waitingForHost) return;
      // A collaborator's change waits for the running check rather than aborting it.
      if (proofing?.remoteChange && running) return;
      restart(options.delay ?? 500);
    },
    destroy() {
      clear();
      cancelFirst?.();
      running?.abort();
      pointer.destroy();
    },
  };
}
