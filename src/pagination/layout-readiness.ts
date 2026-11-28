// Whether an editor's pages are settled: laid out, with no layout due, and drawn, so the views that
// follow the pages, such as a list of contents taking its page numbers or comment cards beside
// their anchors, show them. A layout that throws, or a run of layouts that never stops moving the
// pages, fails instead.

import { type LayoutTraceSink, writeTrace } from './layout-trace.js';

/** Whether an editor's pages are being laid out, are settled, or failed to settle. */
export type LayoutState = 'pending' | 'settled' | 'failed';

/** What readiness reads and tells. */
interface LayoutReadinessOptions {
  /** Runs a callback once the next frame is drawn and returns how to cancel it. */
  readonly schedule: (run: () => void) => () => void;
  /** Tells of each change of state. */
  readonly onChange?: ((state: LayoutState) => void) | undefined;
}

/** Keeps a projection's layout state, and the callers waiting for it to settle. */
export function createLayoutReadiness({ schedule, onChange }: LayoutReadinessOptions) {
  let state: LayoutState = 'pending';
  let destroyed = false;
  let cancel: (() => void) | null = null;
  const waiting: ((state: LayoutState) => void)[] = [];
  const finish = (next: 'settled' | 'failed') => {
    for (const resolve of waiting.splice(0)) resolve(next);
  };
  const cancelFrame = () => {
    const stop = cancel;
    cancel = null;
    stop?.();
  };
  const set = (next: LayoutState) => {
    if (destroyed) return;
    cancelFrame();
    if (next === state) return;
    state = next;
    // A listener can start another layout or throw while handling this transition.
    if (next !== 'pending') finish(next);
    onChange?.(next);
  };
  return {
    state: () => state,
    /** A layout is due. */
    pending(request?: () => void) {
      try {
        set('pending');
      } finally {
        // A listener can fail, but waiters still need the requested layout.
        if (!destroyed) request?.();
      }
    },
    /** The pages could not be laid out. */
    fail: () => set('failed'),
    /**
     * The engine to lay the pages out with, or null when there is none (`engineOrFailure`): pending
     * while it loads, failed, with the reason traced, when there can be none.
     */
    engine<Engine extends object>(found: Engine | string | null, trace?: LayoutTraceSink) {
      if (typeof found === 'object') {
        if (!found) set('pending');
        return found;
      }
      writeTrace(trace, 'fail', () => ({ reason: found }));
      set('failed');
      return null;
    },
    /**
     * A layout landed: the pages settle two frames on, once the views that follow them have drawn,
     * unless another layout is due by then.
     */
    laidOut(isIdle: () => boolean) {
      if (destroyed) return;
      cancelFrame();
      const settle = () => {
        cancel = null;
        if (isIdle()) set('settled');
      };
      cancel = schedule(() => {
        cancel = schedule(settle);
      });
    },
    /** Resolves with `settled` or `failed` once no layout is pending. */
    whenSettled(): Promise<LayoutState> {
      if (state !== 'pending') return Promise.resolve(state);
      return new Promise((resolve) => waiting.push(resolve));
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      state = 'failed';
      finish(state);
      cancelFrame();
    },
  };
}
