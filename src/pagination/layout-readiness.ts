// Whether an editor's pages are settled: laid out, with no layout due, and drawn, so the views that
// follow the pages, such as a list of contents taking its page numbers or comment cards beside
// their anchors, show them. A layout that throws, or a run of layouts that never stops moving the
// pages, fails instead.

/** Whether an editor's pages are being laid out, are settled, or failed to settle. */
export type LayoutState = 'pending' | 'settled' | 'failed';

/** What readiness reads and tells. */
export interface LayoutReadinessOptions {
  /** Runs a callback once the next frame is drawn and returns how to cancel it. */
  readonly schedule: (run: () => void) => () => void;
  /** Tells of each change of state. */
  readonly onChange?: ((state: LayoutState) => void) | undefined;
}

/** Keeps a pagination's layout state, and the callers waiting for it to settle. */
export function createLayoutReadiness({ schedule, onChange }: LayoutReadinessOptions) {
  let state: LayoutState = 'pending';
  let cancel: (() => void) | null = null;
  const waiting: ((state: LayoutState) => void)[] = [];
  const set = (next: LayoutState) => {
    cancel?.();
    cancel = null;
    if (next === state) return;
    state = next;
    onChange?.(next);
    if (next === 'pending') return;
    for (const resolve of waiting.splice(0)) resolve(next);
  };
  return {
    state: () => state,
    /** A layout is due. */
    pending: () => set('pending'),
    /** The pages could not be laid out. */
    fail: () => set('failed'),
    /**
     * A layout landed: the pages settle two frames on, once the views that follow them have drawn,
     * unless another layout is due by then.
     */
    laidOut(isIdle: () => boolean) {
      cancel?.();
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
      cancel?.();
      cancel = null;
    },
  };
}
