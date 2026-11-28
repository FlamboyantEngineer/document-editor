import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deferred } from '../../../test/deferred.js';
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

const nextTemplate = {
  ...template,
  id: 'next',
  styles: { paragraph: { font: 'Lab Sans' } },
};

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
  return renderHook(
    (shown: TemplateFile) =>
      useShownFonts({ template: shown, fonts: adapter, layout: PAGE }, measureIn),
    { initialProps: template },
  );
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
    const { result, rerender } = renderFonts();
    await flush();
    rerender(nextTemplate);
    await act(() => vi.advanceTimersByTimeAsync(600_000));
    expect(load).toHaveBeenCalledTimes(1);
    expect(result.current.text.reason).toBe('no-shaper');
  });

  it('DOCE-PAGINATION-12.5 asks for the current template families when retrying the initial load', async () => {
    const served = servedFonts(['Lab Sans']);
    load
      .mockResolvedValueOnce({ phase: 'browser', reason: 'files-failed', retry: true })
      .mockResolvedValueOnce(served);
    const { result, rerender, unmount } = renderFonts();
    await flush();
    expect(result.current.props.layout).toBe('web');
    rerender(nextTemplate);
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(load.mock.calls[1]?.[1]).toEqual(['Lab Sans', 'serif', 'sans-serif', 'monospace']);
    expect(result.current.props.layout).toBe('page');
    expect(result.current.props.template.styles?.paragraph?.font).toBe('Lab Sans');
    rerender({ ...nextTemplate });
    await flush();
    expect(load).toHaveBeenCalledTimes(2);
    await expect(result.current.text.fonts()).resolves.toBe(served);
    unmount();
    expect(served.destroy).toHaveBeenCalledOnce();
  });

  it('DOCE-PAGINATION-12.5 tries different families after a template has no usable faces', async () => {
    const served = servedFonts(['Lab Sans']);
    load
      .mockResolvedValueOnce({ phase: 'browser', reason: 'no-faces', retry: false })
      .mockResolvedValueOnce(served);
    const { result, rerender } = renderFonts();
    await flush();
    expect(result.current.text.reason).toBe('no-faces');
    rerender({ ...template, styles: { ...template.styles, paragraph: { font: 'lab serif' } } });
    await act(() => vi.advanceTimersByTimeAsync(600_000));
    expect(load).toHaveBeenCalledTimes(1);
    rerender(nextTemplate);
    await flush();
    expect(load).toHaveBeenCalledTimes(2);
    expect(result.current.props.layout).toBe('page');
    expect(result.current.text.reason).toBeNull();
  });

  it('DOCE-PAGINATION-12.5 recovers when the earlier template reports no faces after the switch', async () => {
    const first = deferred<PagesFonts>();
    const served = servedFonts(['Lab Sans']);
    load.mockReturnValueOnce(first.promise).mockResolvedValueOnce(served);
    const { result, rerender } = renderFonts();
    const ready = result.current.text.fonts();
    rerender(nextTemplate);
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => first.resolve({ phase: 'browser', reason: 'no-faces', retry: false }));
    expect(load.mock.calls[1]?.[1]).toEqual(['Lab Sans', 'serif', 'sans-serif', 'monospace']);
    expect(result.current.props.layout).toBe('page');
    await expect(ready).resolves.toBe(served);
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

  it('DOCE-PAGINATION-12.5 stops retrying when the editor goes', async () => {
    load.mockResolvedValue({ phase: 'browser', reason: 'timed-out', retry: true });
    const { unmount } = renderFonts();
    await flush();
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(600_000));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('DOCE-PAGINATION-12.5 releases faces returned after the editor goes', async () => {
    const pending = deferred<PagesFonts>();
    const served = servedFonts(['Lab Serif']);
    load.mockReturnValueOnce(pending.promise);
    const { unmount } = renderFonts();
    unmount();
    await act(async () => pending.resolve(served));
    expect(served.destroy).toHaveBeenCalledOnce();
  });
});
