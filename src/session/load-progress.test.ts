import { describe, expect, it, vi } from 'vitest';
import { createLoadProgress } from './load-progress.js';

const WEIGHTS = { connecting: 10, loading: 40, syncing: 10, layout: 40 };

describe('createLoadProgress', () => {
  it('DOCE-SESSION-9.8 credits each phase by its weight once it is done or skipped, up to 99% until ready', () => {
    const progress = createLoadProgress(WEIGHTS);
    expect(progress.get()).toEqual({
      status: 'loading',
      phase: 'connecting',
      done: 0,
      total: 4,
      percent: 0,
    });
    progress.skip('connecting');
    expect(progress.get()).toMatchObject({ phase: 'loading', done: 1, percent: 9 });
    progress.complete('loading');
    progress.complete('loading');
    expect(progress.get()).toMatchObject({ phase: 'syncing', done: 2, percent: 49 });
    progress.complete('syncing');
    progress.complete('layout');
    expect(progress.get()).toMatchObject({ status: 'loading', phase: null, done: 4, percent: 99 });
    progress.ready();
    expect(progress.get()).toMatchObject({ status: 'ready', percent: 100 });
  });

  it('DOCE-SESSION-9.8 credits work done out of order, and holds while a phase stalls', () => {
    const progress = createLoadProgress(WEIGHTS);
    const told = vi.fn();
    progress.subscribe(told);
    progress.complete('syncing');
    expect(progress.get()).toMatchObject({ phase: 'connecting', percent: 9 });
    expect(told).toHaveBeenCalledOnce();
    progress.complete('syncing');
    expect(told).toHaveBeenCalledOnce();
  });

  it('DOCE-SESSION-9.8 changes nothing once the load is cancelled or failed', () => {
    const cancelled = createLoadProgress(WEIGHTS);
    cancelled.complete('connecting');
    cancelled.cancel();
    cancelled.complete('loading');
    cancelled.ready();
    expect(cancelled.get()).toMatchObject({ status: 'cancelled', done: 1, percent: 9 });
    const failed = createLoadProgress(WEIGHTS);
    failed.fail();
    failed.ready();
    expect(failed.get()).toMatchObject({ status: 'failed', percent: 0 });
  });
});
