// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { type HeadlessPage, printSnapshot } from './headless-print.js';

// A headless page that records what it is asked, whose readiness check answers as told.
function fakePage(ready: () => Promise<unknown>, load = () => Promise.resolve()) {
  const calls: string[] = [];
  const page: HeadlessPage = {
    setContent: (html, options) => {
      calls.push(`setContent ${html} ${options.waitUntil}`);
      return load();
    },
    evaluate: <T>() => {
      calls.push('evaluate');
      return ready() as Promise<T>;
    },
    pdf: (options) => {
      calls.push(`pdf ${String(options.preferCSSPageSize)} ${String(options.printBackground)}`);
      return Promise.resolve(new Uint8Array([37, 80, 68, 70]));
    },
  };
  return { page, calls };
}

describe('printSnapshot', () => {
  it('DOCE-EDITOR-6.26 loads the snapshot, waits for its fonts and images, then prints it', async () => {
    const { page, calls } = fakePage(() => Promise.resolve({ failed: [] }));
    const result = await printSnapshot(page, '<p>Hi</p>');
    expect(result).toEqual({ ok: true, pdf: new Uint8Array([37, 80, 68, 70]), failedImages: [] });
    expect(calls).toEqual(['setContent <p>Hi</p> load', 'evaluate', 'pdf true true']);
  });

  it('DOCE-EDITOR-6.26 prints, naming the images that failed to load', async () => {
    const { page, calls } = fakePage(() => Promise.resolve({ failed: ['https://x.test/a.png'] }));
    const result = await printSnapshot(page, '<p>Hi</p>');
    expect(result.ok && result.failedImages).toEqual(['https://x.test/a.png']);
    expect(calls).toContain('pdf true true');
  });

  it('DOCE-EDITOR-6.26 prints nothing when the page is not ready in time', async () => {
    const { page, calls } = fakePage(() => new Promise(() => undefined));
    expect(await printSnapshot(page, '<p>Hi</p>', { timeout: 10 })).toEqual({
      ok: false,
      reason: 'timeout',
    });
    expect(calls).not.toContain('pdf true true');
  });
  it('DOCE-EDITOR-6.26 times out a load and never starts readiness or prints afterward', async () => {
    let finishLoad = () => {};
    const { page, calls } = fakePage(
      () => Promise.resolve({ failed: [] }),
      () => new Promise<void>((resolve) => (finishLoad = resolve)),
    );
    await expect(printSnapshot(page, '<p>Hi</p>', { timeout: 5 })).resolves.toEqual({
      ok: false,
      reason: 'timeout',
    });
    finishLoad();
    await Promise.resolve();
    expect(calls).toEqual(['setContent <p>Hi</p> load']);
  });

  it('DOCE-EDITOR-6.26 shares one deadline across loading and resource readiness', async () => {
    vi.useFakeTimers();
    try {
      const { page, calls } = fakePage(
        () => new Promise((resolve) => setTimeout(() => resolve({ failed: [] }), 6)),
        () => new Promise<void>((resolve) => setTimeout(resolve, 6)),
      );
      const print = printSnapshot(page, '<p>Hi</p>', { timeout: 10 });
      await vi.advanceTimersByTimeAsync(10);
      await expect(print).resolves.toEqual({ ok: false, reason: 'timeout' });
      expect(calls).toEqual(['setContent <p>Hi</p> load', 'evaluate']);
    } finally {
      vi.useRealTimers();
    }
  });
});
