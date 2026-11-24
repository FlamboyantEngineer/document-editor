import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTrailingTimer } from './trailing-timer.js';

describe('createTrailingTimer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('DOCE-SESSION-2.3 DOCE-SESSION-6.1 DOCE-SESSION-6.7 runs once the pause after the last request ends', () => {
    const run = vi.fn();
    const timer = createTrailingTimer(300, run);
    expect(timer.isPending()).toBe(false);
    timer.schedule();
    vi.advanceTimersByTime(200);
    timer.schedule();
    vi.advanceTimersByTime(299);
    expect(run).not.toHaveBeenCalled();
    expect(timer.isPending()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
    expect(timer.isPending()).toBe(false);
  });

  it('DOCE-SESSION-2.3 DOCE-SESSION-6.1 DOCE-SESSION-6.7 drops a waiting task when cancelled, and may be scheduled again', () => {
    const run = vi.fn();
    const timer = createTrailingTimer(300, run);
    timer.schedule();
    timer.cancel();
    expect(timer.isPending()).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(run).not.toHaveBeenCalled();
    timer.cancel();
    timer.schedule();
    vi.advanceTimersByTime(300);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('DOCE-SESSION-6.7 is not pending while its task runs, so the task may schedule the next one', () => {
    const seen: boolean[] = [];
    const timer = createTrailingTimer(100, () => seen.push(timer.isPending()));
    timer.schedule();
    vi.advanceTimersByTime(100);
    expect(seen).toEqual([false]);
  });
});
