import { describe, expect, it, vi } from 'vitest';
import { observeCanvasSize } from './canvas-page-size.js';

function fixture() {
  const page = document.createElement('div');
  const canvas = document.createElement('canvas');
  const bounds = vi
    .spyOn(canvas, 'getBoundingClientRect')
    .mockReturnValue(new DOMRect(0.6, 0.6, 793.7, 1122.5));
  const dpr = vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(1);
  return { page, canvas, bounds, dpr };
}

function resizeObserver() {
  let callback: ResizeObserverCallback | undefined;
  const observer = { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
  vi.stubGlobal(
    'ResizeObserver',
    vi.fn(function (next: ResizeObserverCallback) {
      callback = next;
      return observer;
    }),
  );
  vi.stubGlobal('ResizeObserverEntry', { prototype: { devicePixelContentBoxSize: [] } });
  return {
    observer,
    notify(target: Element, width: number, height: number) {
      const size = { inlineSize: width, blockSize: height };
      callback?.(
        [
          { target, borderBoxSize: [size], devicePixelContentBoxSize: [size] },
        ] as unknown as ResizeObserverEntry[],
        observer,
      );
    },
  };
}

describe('Canvas device pixels', () => {
  it('DOCE-EDITOR-1.9 uses the browser pixel box and observes changes in physical size', () => {
    const { page, canvas } = fixture();
    const { observer, notify } = resizeObserver();
    const repaint = vi.fn();
    const size = observeCanvasSize(page, canvas, repaint);
    expect(observer.observe).toHaveBeenCalledWith(canvas, { box: 'device-pixel-content-box' });
    notify(page, 793.7, 1122.5);
    expect(canvas.style.getPropertyValue('--de-canvas-width')).toBe('793.7px');
    notify(canvas, 794, 1123);
    expect(size.read()).toEqual(expect.objectContaining({ width: 794, height: 1123 }));
    notify(canvas, 793, 1122);
    expect(size.read()).toEqual(expect.objectContaining({ width: 793, height: 1122 }));
    expect(repaint).toHaveBeenCalled();
    size.disconnect();
    expect(observer.disconnect).toHaveBeenCalled();
  });

  it('DOCE-EDITOR-1.9 rounds both physical edges when device pixel observations are unavailable', () => {
    const { page, canvas, bounds, dpr } = fixture();
    vi.stubGlobal('ResizeObserver', undefined);
    const size = observeCanvasSize(page, canvas, vi.fn());
    expect(size.read()).toEqual({ width: 793, height: 1122 });
    bounds.mockReturnValue(new DOMRect(0.1, 0.1, 793.7, 1122.5));
    expect(size.read()).toEqual({ width: 794, height: 1123 });
    dpr.mockReturnValue(1.25);
    expect(size.read()).toEqual({ width: 992, height: 1403 });
  });

  it('DOCE-EDITOR-1.9 discards stale sizes after DPR or displayed zoom changes', () => {
    const { page, canvas, bounds, dpr } = fixture();
    const { notify } = resizeObserver();
    const size = observeCanvasSize(page, canvas, vi.fn());
    notify(canvas, 794, 1123);
    dpr.mockReturnValue(2);
    expect(size.read()).toEqual({ width: 1588, height: 2245 });
    // Some device emulation and CSS transforms leave ResizeObserver's device box unscaled.
    notify(canvas, 794, 1123);
    expect(size.read()).toEqual({ width: 1588, height: 2245 });
    bounds.mockReturnValue(new DOMRect(0, 0, 400, 600));
    expect(size.read()).toEqual({ width: 800, height: 1200 });
  });
});
