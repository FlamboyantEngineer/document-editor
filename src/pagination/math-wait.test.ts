import { EditorState } from 'prosemirror-state';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseMarkup } from '../../test/document-markup.js';
import type { LayoutTrace } from './layout-trace.js';
import { MATH_WAIT_TIMEOUT, waitsForMath } from './math-wait.js';
import type { PagesTextEngine } from './text-engine-types.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('waitsForMath', () => {
  it('DOCE-PAGINATION-14.4 stops waiting on math that never loads, and says so in the trace', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const lines: LayoutTrace[] = [];
    const pending = vi.fn();
    // A math layouter whose load never ends.
    const engine = {
      mathPending: () => new Promise<void>(() => undefined),
    } as unknown as PagesTextEngine;
    const waiting = {
      canonical: EditorState.create({ doc: parseMarkup('<p>x</p>') }),
      owner: document,
      pace: { readiness: { pending }, text: { engine: () => engine } },
      trace: () => (line: LayoutTrace) => lines.push(line),
    };
    const resume = vi.fn();
    expect(waitsForMath(waiting, resume)).toBe(true);
    expect(pending).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(MATH_WAIT_TIMEOUT - 1);
    expect(resume).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(resume).toHaveBeenCalledOnce();
    expect(lines.map(({ line }) => line)).toEqual(['math.late why=timed-out']);
    // The pages are laid out with the math they have from then on.
    expect(waitsForMath(waiting, resume)).toBe(false);
  });

  it('DOCE-PAGINATION-14.4 resumes as soon as the math is ready', async () => {
    let ready = () => undefined as void;
    const engine = {
      mathPending: () => new Promise<void>((resolve) => (ready = resolve)),
    } as unknown as PagesTextEngine;
    const waiting = {
      canonical: EditorState.create({ doc: parseMarkup('<p>x</p>') }),
      owner: document,
      pace: { readiness: { pending: vi.fn() }, text: { engine: () => engine } },
    };
    const resume = vi.fn();
    expect(waitsForMath(waiting, resume)).toBe(true);
    ready();
    await vi.waitFor(() => expect(resume).toHaveBeenCalledOnce());
  });

  it('DOCE-PAGINATION-14.4 lays the pages out again when the late math arrives', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let arrive = () => undefined as void;
    const engine = {
      mathPending: () => new Promise<void>((resolve) => (arrive = resolve)),
    } as unknown as PagesTextEngine;
    const waiting = lateWaiting(engine);
    const resume = vi.fn();
    expect(waitsForMath(waiting, resume)).toBe(true);
    await vi.advanceTimersByTimeAsync(MATH_WAIT_TIMEOUT);
    expect(resume).toHaveBeenCalledOnce();
    // The math that ran past the wait arrives at second 31.
    await vi.advanceTimersByTimeAsync(1000);
    arrive();
    await vi.waitFor(() => expect(resume).toHaveBeenCalledTimes(2));
  });

  it('DOCE-PAGINATION-14.4 lays the pages out again for math typed after the wait, one ask at a time', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const settles: (() => void)[] = [];
    let pending: Promise<void> | null = new Promise<void>((resolve) => settles.push(resolve));
    const engine = { mathPending: () => pending } as unknown as PagesTextEngine;
    const waiting = lateWaiting(engine);
    const resume = vi.fn();
    expect(waitsForMath(waiting, resume)).toBe(true);
    await vi.advanceTimersByTimeAsync(MATH_WAIT_TIMEOUT);
    settles[0]?.();
    await vi.waitFor(() => expect(resume).toHaveBeenCalledTimes(2));
    // A new equation's typeset: the pages are not held, but asked for again once it settles.
    pending = new Promise<void>((resolve) => settles.push(resolve));
    expect(waitsForMath(waiting, resume)).toBe(false);
    expect(waitsForMath(waiting, resume)).toBe(false);
    expect(waiting.pace.readiness.pending).toHaveBeenCalledOnce();
    settles[1]?.();
    await vi.waitFor(() => expect(resume).toHaveBeenCalledTimes(3));
    // With nothing pending, nothing is asked.
    pending = null;
    expect(waitsForMath(waiting, resume)).toBe(false);
    await Promise.resolve();
    expect(resume).toHaveBeenCalledTimes(3);
  });
});

// What a layout waits with, its math pending on `engine`.
function lateWaiting(engine: PagesTextEngine) {
  return {
    canonical: EditorState.create({ doc: parseMarkup('<p>x</p>') }),
    owner: document,
    pace: { readiness: { pending: vi.fn() }, text: { engine: () => engine } },
  };
}
