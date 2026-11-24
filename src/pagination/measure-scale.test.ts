import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  holdMeasureScale,
  layoutMargin,
  MEASURE_ZOOM_PROPERTY,
  measuredZoom,
  unzoom,
} from './measure-scale.js';

// A window's resolution query that a test can change, as moving to another screen does.
function screens(ratio: number) {
  const listeners = new Set<() => void>();
  const query = {
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  };
  vi.spyOn(window, 'devicePixelRatio', 'get').mockImplementation(() => ratio);
  vi.stubGlobal('matchMedia', () => query as unknown as MediaQueryList);
  return {
    move(to: number) {
      ratio = to;
      for (const listener of [...listeners]) listener();
    },
    listening: () => listeners.size,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('holdMeasureScale', () => {
  it('DOCE-PAGINATION-10.10 publishes the inverse of the pixel ratio, again on another screen', () => {
    const screen = screens(2);
    const measureIn = document.createElement('div');
    const changed = vi.fn();
    const stop = holdMeasureScale(measureIn, changed);
    expect(measureIn.style.getPropertyValue(MEASURE_ZOOM_PROPERTY)).toBe('0.5');
    expect(changed).not.toHaveBeenCalled();
    screen.move(1.25);
    expect(measureIn.style.getPropertyValue(MEASURE_ZOOM_PROPERTY)).toBe('0.8');
    expect(changed).toHaveBeenCalledTimes(1);
    expect(screen.listening()).toBe(1);
    stop();
    expect(measureIn.style.getPropertyValue(MEASURE_ZOOM_PROPERTY)).toBe('');
    expect(screen.listening()).toBe(0);
  });

  it('DOCE-PAGINATION-10.10 divides by the zoom the browser draws an element at, else 1', () => {
    const element = document.createElement('div');
    expect(measuredZoom(element)).toBe(1);
    Object.defineProperty(element, 'currentCSSZoom', { value: 0.5 });
    expect(measuredZoom(element)).toBe(0.5);
  });

  it('DOCE-PAGINATION-10.10 snaps a size divided by an inexact zoom to the layout unit', () => {
    expect(708.425 / 0.8).not.toBe(885.53125);
    expect(unzoom(708.425, 0.8)).toBe(885.53125);
    expect(unzoom(295.177, 1 / 3)).toBe(885.53125);
    expect(unzoom(41.0625, 1)).toBe(41.0625);
  });

  it('DOCE-PAGINATION-2.2 truncates a computed margin to the layout unit, as Chromium lays it out', () => {
    expect(layoutMargin(9.33333)).toBe(9.328125);
    expect(layoutMargin(18.6667)).toBe(18.65625);
    expect(layoutMargin(10.65625)).toBe(10.65625);
    expect(layoutMargin(8)).toBe(8);
    expect(layoutMargin(-9.33333)).toBe(-9.328125);
    expect(layoutMargin(0)).toBe(0);
  });
});
