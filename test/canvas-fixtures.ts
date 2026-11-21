// A Canvas for Pretext in jsdom, which has none: every character advances half the font's size, a
// space a quarter, so a test can work out line breaks by hand. The text layout engine's own
// browser tests measure with Chromium's Canvas.

import { vi } from 'vitest';

function fontSize(font: string): number {
  const match = /(\d+(?:\.\d+)?)px/.exec(font);
  return match ? Number(match[1]) : 16;
}

/** The width the fake Canvas gives a text in a font. */
export function fakeTextWidth(text: string, font: string): number {
  const size = fontSize(font);
  let width = 0;
  for (const character of text) width += character === ' ' ? size / 4 : size / 2;
  return width;
}

/** Installs the fake Canvas as `OffscreenCanvas` for the current test file. */
export function installFakeCanvas(): void {
  class FakeContext {
    font = '10px sans-serif';
    letterSpacing = '0px';
    textRendering = 'auto';
    fontKerning = 'auto';
    measureText(text: string) {
      return { width: fakeTextWidth(text, this.font) };
    }
  }
  class FakeOffscreenCanvas {
    constructor(
      readonly width: number,
      readonly height: number,
    ) {}
    getContext() {
      return new FakeContext();
    }
  }
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
}
