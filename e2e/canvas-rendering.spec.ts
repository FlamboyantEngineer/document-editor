import { expect, test } from './fixtures.js';

// The CI image may predate Chrome 157, where this API became enabled by default.
test.use({
  launchOptions: {
    executablePath: process.env.CHROMIUM_PATH,
    args: ['--enable-blink-features=CanvasDrawElement'],
  },
});

test('DOCE-EDITOR-1.9 falls back to editable HTML without the native API', async ({
  page,
  lab,
}) => {
  await page.addInitScript(() => {
    Reflect.deleteProperty(HTMLCanvasElement.prototype, 'requestPaint');
  });
  await lab.open('document-editor');
  const pages = page.locator('.de-document-editor__content .pm-page');
  const before = await pages.allTextContents();
  await page.getByLabel('HTML-in-Canvas', { exact: true }).check();
  await expect(page.locator('.de-document-editor')).toHaveAttribute('data-layout-state', 'settled');
  await expect(page.locator('.de-document-editor__canvas')).toHaveCount(0);
  expect(await pages.allTextContents()).toEqual(before);
  const heading = page.locator('.de-document-editor__content h1', { hasText: 'Timing' });
  await heading.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' updated');
  await expect(heading).toHaveText('Timing updated');
});

test.describe('native HTML-in-Canvas', () => {
  for (const dpr of [1, 1.25, 2]) {
    test.describe(`DPR ${String(dpr)}`, () => {
      test.use({ deviceScaleFactor: dpr });
      test('DOCE-EDITOR-1.9 DOCE-PAGINATION-5.14 preserves page breaks and editing at fractional zoom', async ({
        page,
        lab,
      }) => {
        await lab.open('document-editor');
        const pages = page.locator('.de-document-editor__content .pm-page');
        const before = await pages.allTextContents();
        await page.getByLabel('HTML-in-Canvas', { exact: true }).check();
        const canvas = page.locator('.de-document-editor__canvas').first();
        await expect(canvas).toBeVisible();
        await expect(page.locator('.de-document-editor')).toHaveAttribute(
          'data-layout-state',
          'settled',
        );
        expect(await pages.allTextContents()).toEqual(before);
        for (const zoom of [0.75, 1, 1.25, 2]) {
          // Exercise the documented host zoom property without going through toolbar presets.
          await page
            .locator('.de-document-editor')
            .evaluate((root, value) => root.style.setProperty('--de-zoom', String(value)), zoom);
          await expect(async () => {
            const size = await canvas.evaluate((element) => {
              const canvas = element as HTMLCanvasElement;
              const rect = canvas.getBoundingClientRect();
              return {
                width: canvas.width,
                height: canvas.height,
                expectedWidth: Math.ceil(rect.width * devicePixelRatio),
                expectedHeight: Math.ceil(rect.height * devicePixelRatio),
              };
            });
            expect(size.width).toBe(size.expectedWidth);
            expect(size.height).toBe(size.expectedHeight);
          }).toPass();
          expect(await pages.allTextContents()).toEqual(before);
        }
        await page
          .locator('.de-document-editor')
          .evaluate((root) => root.style.setProperty('--de-zoom', '1'));
        const heading = page.locator('.de-document-editor__content h1', { hasText: 'Timing' });
        await heading.click();
        await page.keyboard.press('End');
        await page.keyboard.type(' updated');
        await expect(heading).toHaveText('Timing updated');
        await page.keyboard.press('ControlOrMeta+z');
        await expect(heading).toHaveText('Timing');
        await page.getByLabel('HTML-in-Canvas', { exact: true }).uncheck();
        await expect(page.locator('.de-document-editor__canvas')).toHaveCount(0);
        expect(await pages.allTextContents()).toEqual(before);
      });
    });
  }
});

test('DOCE-PAGINATION-5.14 keeps a long plain paragraph on the same pages with canvas measurements', async ({
  page,
  lab,
}) => {
  await lab.open('document-editor');
  const paragraph = page.locator('.de-document-editor__content .pm-page-content p').first();
  await paragraph.click();
  await page.keyboard.press('Home');
  await page.keyboard.insertText(
    'A paragraph with ordinary words and punctuation fills several pages. '.repeat(700),
  );
  await expect(page.locator('.de-document-editor')).toHaveAttribute('data-layout-state', 'settled');
  const pages = page.locator('.de-document-editor__content .pm-page');
  const before = await pages.allTextContents();
  await page.getByLabel('HTML-in-Canvas', { exact: true }).check();
  await expect(page.locator('.de-document-editor__canvas').first()).toBeVisible();
  await expect(page.locator('.de-document-editor')).toHaveAttribute('data-layout-state', 'settled');
  expect(await pages.allTextContents()).toEqual(before);
});
