import { describe, expect, it } from 'vitest';
import { createStruts } from './metrics.js';

// A font whose ascent is 0.9 and descent 0.2 of its size, as a Canvas context reports them.
const context = () => {
  let font = '';
  return {
    get font() {
      return font;
    },
    set font(value: string) {
      font = value;
    },
    measureText: () => {
      const size = Number.parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? '0');
      return {
        fontBoundingBoxAscent: size * 0.9,
        fontBoundingBoxDescent: size * 0.2,
      } as TextMetrics;
    },
  };
};

describe('createStruts', () => {
  it('DOCE-PAGINATION-9.5 puts the baseline where Chromium does, the half leading in whole device pixels', () => {
    // 14.667px: an ascent of 13.2 rounds to 13 and a descent of 2.93 to 3. Of the 4.53px leading
    // left in a 20.53px line, 2 whole pixels go above, so the baseline is 15px from the top.
    const strutOf = createStruts({ context });
    expect(strutOf('14.6667px "Face"', 14.6667, 20.53125)).toEqual({
      ascent: 15,
      descent: 5.53125,
    });
    // At a ratio of 2 the half leading is truncated to half pixels: 13 + 2 (2.27 truncated).
    const atTwo = createStruts({ context, scale: 2 });
    expect(atTwo('14.6667px "Face"', 14.6667, 20.53125).ascent).toBe(15);
  });

  it('DOCE-PAGINATION-9.5 moves a pixel from the ascent to a descent that rounding shortened, at every ratio', () => {
    // 16px: an ascent of 14.4 rounds to 14 and a descent of 3.2 down to 3, so Chromium takes 13 and
    // 4. Of the 5px leading left in a 22px line, 2 whole pixels go above: the baseline is at 15.
    expect(createStruts({ context })('16px "Face"', 16, 22)).toEqual({ ascent: 15, descent: 7 });
  });
});
