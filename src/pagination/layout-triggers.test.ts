import type { EditorView } from 'prosemirror-view';
import { describe, expect, it, vi } from 'vitest';
import { awaitReady, beforePaintIn, settleEdits } from './layout-triggers.js';

describe('what the layout waits for', () => {
  it('DOCE-PAGINATION-5.6 waits for what the measurements wait for, loaded or failed', async () => {
    const settled: string[] = [];
    expect(awaitReady(undefined, () => settled.push('none')).waiting()).toBe(false);
    const loaded = awaitReady(Promise.resolve(), () => settled.push('loaded'));
    const failed = awaitReady(Promise.reject(new Error('offline')), () => settled.push('failed'));
    expect([loaded.waiting(), failed.waiting()]).toEqual([true, true]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect([loaded.waiting(), failed.waiting()]).toEqual([false, false]);
    expect(settled).toEqual(['loaded', 'failed']);
  });
});

describe('first layout schedule', () => {
  it('DOCE-PAGINATION-5.12 runs before the next paint, in a microtask, unless cancelled', async () => {
    const schedule = beforePaintIn(document.createElement('div'));
    const ran: string[] = [];
    schedule(() => ran.push('first'));
    const cancel = schedule(() => ran.push('cancelled'));
    cancel();
    expect(ran).toEqual([]);
    await Promise.resolve();
    expect(ran).toEqual(['first']);
  });
});

describe('settling edits', () => {
  it.each(['dragend', 'drop', 'blur'])(
    'DOCE-PAGINATION-7.1 lays out the edits made during a press that ends with %s',
    (ending) => {
      vi.useFakeTimers();
      let time = 1;
      vi.spyOn(window.performance, 'now').mockImplementation(() => time);
      try {
        const request = vi.fn();
        const element = document.body.appendChild(document.createElement('div'));
        const edits = settleEdits({ element, settle: 10 }, request);
        const dom = document.body.appendChild(document.createElement('div'));
        const stop = edits.watch({ dom } as unknown as EditorView);
        dom.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        edits.request();
        time += 100;
        vi.advanceTimersByTime(100);
        expect(request).not.toHaveBeenCalled();
        const target = ending === 'blur' ? window : dom;
        target.dispatchEvent(new Event(ending, { bubbles: true }));
        expect(request).toHaveBeenCalledOnce();
        stop();
      } finally {
        vi.useRealTimers();
        vi.restoreAllMocks();
      }
    },
  );
});
