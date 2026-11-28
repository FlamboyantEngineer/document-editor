import { describe, expect, it } from 'vitest';
import { layoutMargin, measuredZoom, unzoom } from './measure-scale.js';

describe('measure scale', () => {
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
