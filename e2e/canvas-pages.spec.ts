import type { Locator, Page } from '@playwright/test';
import type { RegressionProbe } from '../labs/src/regression/regression-probe.js';
import { expect, test, waitForLab } from './fixtures.js';

// Pages painted into a canvas (specs/DOCUMENT-EDITOR.md DOCE-EDITOR-1.9), in the regression lab with
// `rendering=html-canvas`. Chromium before 157 needs `--enable-blink-features=CanvasDrawElement`
// for the API, which the projects pass (playwright.config.ts). The `chromium-dpr-*` projects run
// these at real device pixel ratios.

declare global {
  interface Window {
    regressionLab: RegressionProbe;
  }
}

const CANVAS = '.de-document-editor__content .de-document-editor__canvas';

async function open(page: Page, query: string) {
  await page.goto(`regression.html?rendering=html-canvas&${query}`);
  await waitForLab(page);
  await expect(page.locator('.de-document-editor')).toHaveAttribute('data-layout-state', 'settled');
}

/** A canvas's bitmap size against the device pixels its box covers, edges rounded. */
const bitmapOf = (canvas: Locator) =>
  canvas.evaluate((element: HTMLCanvasElement) => {
    const rect = element.getBoundingClientRect();
    const ratio = devicePixelRatio;
    return {
      bitmap: [element.width, element.height],
      box: [
        Math.round(rect.right * ratio) - Math.round(rect.left * ratio),
        Math.round(rect.bottom * ratio) - Math.round(rect.top * ratio),
      ],
    };
  });

/** A short fingerprint of a canvas's pixels, which changes when the page is painted otherwise. */
const pixelsOf = (canvas: Locator) =>
  canvas.evaluate((element: HTMLCanvasElement) => {
    const context = element.getContext('2d');
    if (!context || !element.width) return '';
    const { data } = context.getImageData(0, 0, element.width, element.height);
    let hash = 0;
    for (let index = 0; index < data.length; index += 7)
      hash = (hash * 31 + (data[index] ?? 0)) | 0;
    return String(hash);
  });

test('DOCE-EDITOR-1.9 paints every page into a canvas of its exact device pixels at each zoom', async ({
  page,
}) => {
  // Five loads of the long document, each painted into canvases: about 26 s on CI at a ratio of
  // 1.25 and more at 2, so the default 30 s is too short.
  test.setTimeout(90_000);
  for (const zoom of [50, 75, 100, 125, 150]) {
    await open(page, `document=long-mixed&textLayout=pretext&zoom=${String(zoom)}`);
    const pages = page.locator('.de-document-editor__content .pm-page');
    await expect(page.locator(`${CANVAS} > .pm-page`)).toHaveCount(await pages.count());
    const first = page.locator(CANVAS).first();
    await expect(async () => {
      const { bitmap, box } = await bitmapOf(first);
      expect(bitmap, `bitmap at ${String(zoom)}%`).toEqual(box);
    }).toPass();
    expect(await pixelsOf(first), 'a painted page').not.toBe('');
  }
});

test('DOCE-EDITOR-1.9 typing edits the page and paints it again', async ({ page }) => {
  await open(page, 'document=long-mixed&textLayout=pretext');
  const canvas = page.locator(CANVAS).first();
  const paragraph = canvas.locator('.pm-page-content p').first();
  await expect.poll(() => pixelsOf(canvas)).not.toBe('');
  const before = await pixelsOf(canvas);
  await paragraph.click();
  await page.keyboard.press('Home');
  await page.keyboard.type('Painted ');
  await expect(paragraph).toContainText('Painted ');
  await expect.poll(() => pixelsOf(canvas), 'the page painted again').not.toBe(before);
});

test('DOCE-EDITOR-1.9 a canvas far from the screen gives its bitmap back', async ({ page }) => {
  await open(page, 'document=long-mixed');
  const canvases = page.locator(CANVAS);
  expect(await canvases.count()).toBeGreaterThan(10);
  await expect
    .poll(() => canvases.last().evaluate((each: HTMLCanvasElement) => each.width))
    .toBe(0);
  await canvases.last().scrollIntoViewIfNeeded();
  await expect
    .poll(() => canvases.last().evaluate((each: HTMLCanvasElement) => each.width))
    .toBeGreaterThan(0);
});

test('DOCE-EDITOR-1.9 without the API the pages stay editable HTML with the same text', async ({
  page,
}) => {
  await page.goto('regression.html?document=long-mixed');
  await waitForLab(page);
  const pages = page.locator('.de-document-editor__content .pm-page');
  const text = await pages.allTextContents();
  await page.addInitScript(() => {
    Reflect.deleteProperty(HTMLCanvasElement.prototype, 'requestPaint');
  });
  await open(page, 'document=long-mixed');
  await expect(page.locator(CANVAS)).toHaveCount(0);
  await expect(pages.first()).toHaveAttribute('data-canvas-fallback', 'unsupported');
  expect(await pages.allTextContents()).toEqual(text);
  const paragraph = pages.first().locator('.pm-page-content p').first();
  await paragraph.click();
  await page.keyboard.press('Home');
  await page.keyboard.type('Still ');
  await expect(paragraph).toContainText('Still ');
});

test('DOCE-EDITOR-1.9 a snapshot copies the pages without their canvases', async ({ page }) => {
  await open(page, 'document=long-mixed');
  const markup = await page.evaluate(() => window.regressionLab.snapshot());
  expect(markup).not.toBeNull();
  expect(markup).toContain('pm-page');
  expect(markup).not.toContain('<canvas');
  expect(markup).not.toContain('data-canvas-fallback');
});
