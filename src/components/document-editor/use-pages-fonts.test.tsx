import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FontsAdapter } from '../../host/adapters.js';
import type { FontFaceFile, FontFiles } from '../../host/font-files.js';
import type { TemplateFile } from '../../model/index.js';
import type * as ServedFontsModule from '../../pagination/served-fonts.js';
import type { PagesFonts, ServedFonts } from '../../pagination/served-fonts.js';
import { useShownFonts } from './use-pages-fonts.js';

const load = vi.hoisted(() => vi.fn());
vi.mock('../../pagination/served-fonts.js', async (actual) => ({
  ...(await actual<typeof ServedFontsModule>()),
  loadPagesFonts: load,
}));

const template = {
  formatVersion: 1,
  id: 'plain',
  name: 'Plain',
  styles: { paragraph: { font: 'Lab Serif' }, heading1: { font: 'Lab Display' } },
} as unknown as TemplateFile;

const face = (family: string): FontFaceFile => ({
  family,
  weight: 400,
  style: 'normal',
  bytes: new Uint8Array(0),
});

// Served fonts that serve `families`, more as the test adds them.
function servedFonts(families: string[]): ServedFonts {
  const files = (): FontFiles => ({ faces: families.map(face) });
  return {
    phase: 'pretext',
    measureContext: () => ({}) as ReturnType<ServedFonts['measureContext']>,
    isFontServed: (family) => families.includes(family),
    reserve: () => null,
    missing: () => undefined,
    generics: {},
    files,
    drawing: () => ({
      files: files(),
      drawnFamily: (family) => family,
      drawnFiles: files,
      adopt: () => undefined,
    }),
    add: () => Promise.resolve(false),
    destroy: vi.fn(),
  };
}

const adapter: FontsAdapter = {
  load: (families) => Promise.resolve({ ok: true, value: families }),
};

const PAGE: 'page' | 'web' = 'page';

function renderFonts() {
  const element = document.createElement('div');
  const measureIn = { current: element };
  return renderHook(() => useShownFonts({ template, fonts: adapter, layout: PAGE }, measureIn));
}

const flush = () => act(() => vi.advanceTimersByTimeAsync(0));

beforeEach(() => {
  vi.useFakeTimers();
  load.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('useShownFonts', () => {
  it('DOCE-PAGINATION-12.5 asks again for fonts whose first load failed, and pages the document once they arrive', async () => {
    const served = servedFonts(['Lab Serif', 'Lab Display']);
    const failed: PagesFonts = { phase: 'browser', reason: 'files-failed', retry: true };
    load.mockResolvedValueOnce(failed).mockResolvedValueOnce(failed).mockResolvedValueOnce(served);
    const { result } = renderFonts();
    await flush();
    expect(result.current.text.reason).toBe('files-failed');
    expect(result.current.props.layout).toBe('web');
    // A second later, then two seconds after the next failure; the web layout meanwhile.
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(load).toHaveBeenCalledTimes(2);
    expect(result.current.text.reason).toBe('files-failed');
    await act(() => vi.advanceTimersByTimeAsync(1999));
    expect(load).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(load).toHaveBeenCalledTimes(3);
    expect(result.current.text.reason).toBeNull();
    expect(result.current.props.layout).not.toBe('web');
    // The pages read the fonts of the load that brought them.
    await expect(result.current.text.fonts()).resolves.toBe(served);
  });

  it('DOCE-PAGINATION-12.5 never asks again when the host serves nothing usable', async () => {
    load.mockResolvedValue({ phase: 'browser', reason: 'no-shaper', retry: false });
    const { result } = renderFonts();
    await flush();
    await act(() => vi.advanceTimersByTimeAsync(600_000));
    expect(load).toHaveBeenCalledTimes(1);
    expect(result.current.text.reason).toBe('no-shaper');
  });

  it('DOCE-PAGINATION-12.5 draws a family asked for again in its own faces once they arrive, with no new template', async () => {
    const families = ['Lab Serif'];
    const served = servedFonts(families);
    load.mockResolvedValueOnce(served);
    const { result } = renderFonts();
    await flush();
    expect(result.current.props.template.styles?.heading1?.font).toBe('Lab Serif');
    const [, , options] = load.mock.calls[0] as [unknown, unknown, { retried: () => void }];
    families.push('Lab Display');
    act(() => options.retried());
    expect(result.current.props.template.styles?.heading1?.font).toBe('Lab Display');
  });

  it('DOCE-PAGINATION-12.5 stops asking and takes the faces out when the editor goes', async () => {
    load.mockResolvedValue({ phase: 'browser', reason: 'timed-out', retry: true });
    const { unmount } = renderFonts();
    await flush();
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(600_000));
    expect(load).toHaveBeenCalledTimes(1);
  });
});
