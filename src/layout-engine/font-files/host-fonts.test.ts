// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { harfBuzzWasm, referenceFaces } from '../../../test/font-files-node.js';
import type { FontsAdapter, HostResult } from '../../host/adapters.js';
import type { FontFiles, FontShaper } from '../../host/font-files.js';
import { loadHostFonts, PENDING_FONTS } from './host-fonts.js';

const served = (): FontFiles => ({
  faces: referenceFaces().map(({ italic, ...face }) => ({
    ...face,
    style: italic ? 'italic' : 'normal',
  })),
});
const ok = <T>(value: T): HostResult<T> => ({ ok: true, value });

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const adapter = (overrides: Partial<FontsAdapter>): FontsAdapter => ({
  load: () => Promise.resolve(ok([])),
  ...overrides,
});

describe('DOCE-HOST-1.14.1 Pretext layout waits for the host font files', () => {
  it('starts nothing and measures nothing before the files arrive', async () => {
    const files = deferred<HostResult<FontFiles>>();
    let settled = false;
    const loading = loadHostFonts(
      adapter({
        shaper: () => Promise.resolve(ok<FontShaper>(harfBuzzWasm())),
        files: () => files.promise,
      }),
      ['Lab Geist'],
      { timeout: 10_000 },
    ).then((fonts) => {
      settled = true;
      return fonts;
    });
    await new Promise((done) => setTimeout(done, 50));
    expect(settled).toBe(false);
    expect(PENDING_FONTS).toEqual({ phase: 'browser', reason: 'pending' });
    files.resolve(ok(served()));
    const fonts = await loading;
    expect(fonts.phase).toBe('pretext');
  });

  it.each([
    ['no-shaper', adapter({ files: () => Promise.resolve(ok(served())) })],
    ['no-files', adapter({ shaper: () => Promise.resolve(ok<FontShaper>(harfBuzzWasm())) })],
    [
      'files-failed',
      adapter({
        shaper: () => Promise.resolve(ok<FontShaper>(harfBuzzWasm())),
        files: () => Promise.reject(new Error('offline')),
      }),
    ],
    [
      'shaper-failed',
      adapter({
        shaper: () => Promise.resolve({ ok: false, error: { kind: 'unavailable' } }),
        files: () => Promise.resolve(ok(served())),
      }),
    ],
    [
      'no-faces',
      adapter({
        shaper: () => Promise.resolve(ok<FontShaper>(harfBuzzWasm())),
        files: () =>
          Promise.resolve(
            ok({ faces: served().faces.map((face) => ({ ...face, bytes: new Uint8Array() })) }),
          ),
      }),
    ],
  ])('keeps the browser layout and says why: %s', async (reason, fonts) => {
    const loaded = await loadHostFonts(fonts, ['Lab Geist'], { timeout: 10_000 });
    expect(loaded).toMatchObject({ phase: 'browser', reason });
    // Only a request that failed is worth making again (DOCE-PAGINATION-12.5).
    expect(loaded.phase === 'browser' && Boolean(loaded.retry)).toBe(reason.endsWith('-failed'));
  });

  it('keeps the browser layout without a fonts adapter', async () => {
    expect(await loadHostFonts(undefined, [], { timeout: 10_000 })).toEqual({
      phase: 'browser',
      reason: 'no-shaper',
    });
  });

  it('DOCE-PAGINATION-12.5 gives up on a host that never answers, saying so, and aborts its request', async () => {
    vi.useFakeTimers();
    let aborted: AbortSignal | undefined;
    const loading = loadHostFonts(
      adapter({
        shaper: () => Promise.resolve(ok<FontShaper>(harfBuzzWasm())),
        files: (_families, { signal }) => {
          aborted = signal;
          return new Promise(() => undefined);
        },
      }),
      ['Lab Geist'],
      { timeout: 30_000 },
    );
    await vi.advanceTimersByTimeAsync(29_999);
    expect(aborted?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(loading).resolves.toEqual({ phase: 'browser', reason: 'timed-out', retry: true });
    expect(aborted?.aborted).toBe(true);
    vi.useRealTimers();
  });

  it('fails with a reason, never a throw, when the adapter throws instead of rejecting', async () => {
    const broken = () => {
      throw new Error('broken adapter');
    };
    await expect(
      loadHostFonts(
        adapter({ shaper: broken, files: () => Promise.resolve(ok(served())) }),
        ['Lab Geist'],
        { timeout: 10_000 },
      ),
    ).resolves.toEqual({ phase: 'browser', reason: 'shaper-failed', retry: true });
    await expect(
      loadHostFonts(
        adapter({ shaper: () => Promise.resolve(ok<FontShaper>(harfBuzzWasm())), files: broken }),
        ['Lab Geist'],
        { timeout: 10_000 },
      ),
    ).resolves.toEqual({ phase: 'browser', reason: 'files-failed', retry: true });
  });
});
