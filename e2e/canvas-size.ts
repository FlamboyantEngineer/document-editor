import type { Locator } from '@playwright/test';
import { expect } from './fixtures.js';

/** Checks the browser's actual pixel box, which can change even when CSS width stays the same. */
export async function expectCanvasPixels(canvas: Locator, emulatedDpr = false) {
  await expect(async () => {
    const sizes = await canvas.evaluate(
      (element, emulated) =>
        new Promise<number[][]>((resolve) => {
          const observer = new ResizeObserver(([entry]) => {
            const pixels = entry?.devicePixelContentBoxSize[0];
            const canvas = element as HTMLCanvasElement;
            const rect = canvas.getBoundingClientRect();
            // CDP's deviceScaleFactor overrides DPR without changing the physical observer box.
            const expected = emulated
              ? [
                  Math.round(rect.right * devicePixelRatio) -
                    Math.round(rect.left * devicePixelRatio),
                  Math.round(rect.bottom * devicePixelRatio) -
                    Math.round(rect.top * devicePixelRatio),
                ]
              : [pixels?.inlineSize ?? 0, pixels?.blockSize ?? 0];
            resolve([[canvas.width, canvas.height], expected]);
            observer.disconnect();
          });
          observer.observe(element, { box: 'device-pixel-content-box' });
        }),
      emulatedDpr,
    );
    expect(sizes[0]).toEqual(sizes[1]);
  }).toPass();
}
