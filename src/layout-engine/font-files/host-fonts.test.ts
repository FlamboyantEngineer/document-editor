// @vitest-environment node
import { describe, expect, it } from 'vitest';
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
    expect(await loadHostFonts(fonts, ['Lab Geist'])).toEqual({ phase: 'browser', reason });
  });

  it('keeps the browser layout without a fonts adapter', async () => {
    expect(await loadHostFonts(undefined, [])).toEqual({ phase: 'browser', reason: 'no-shaper' });
  });

  it('fails with a reason, never a throw, when the adapter throws instead of rejecting', async () => {
    const broken = () => {
      throw new Error('broken adapter');
    };
    await expect(
      loadHostFonts(adapter({ shaper: broken, files: () => Promise.resolve(ok(served())) }), [
        'Lab Geist',
      ]),
    ).resolves.toEqual({ phase: 'browser', reason: 'shaper-failed' });
    await expect(
      loadHostFonts(
        adapter({ shaper: () => Promise.resolve(ok<FontShaper>(harfBuzzWasm())), files: broken }),
        ['Lab Geist'],
      ),
    ).resolves.toEqual({ phase: 'browser', reason: 'files-failed' });
  });
});
