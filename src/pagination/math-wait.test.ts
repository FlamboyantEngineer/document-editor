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
});
