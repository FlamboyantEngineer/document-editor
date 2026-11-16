import type { Page } from '@playwright/test';
import { expectCanvasPixels } from './canvas-size.js';
import { expect, test, waitForLab } from './fixtures.js';

// Chromium 156 in the development image exposes the stable API behind this flag.
test.use({
  deviceScaleFactor: 1.25,
  launchOptions: {
    executablePath: process.env.CHROMIUM_PATH,
    args: ['--enable-blink-features=CanvasDrawElement', '--force-device-scale-factor=1.25'],
  },
});

async function choose(page: Page, label: string, option: string) {
  await page.getByRole('button', { name: new RegExp(`${label}$`) }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
}

test('DOCE-LABS-3.8 switches rendering and fractional zoom without losing edits or page breaks', async ({
  page,
  lab,
}) => {
  await lab.open('canvas');
  const diagnostics = page.getByLabel('Canvas diagnostics');
  await expect(diagnostics).toContainText('Native HTML-in-Canvas: available');
  await expect(diagnostics).toContainText('DPR: 1.25');
  const heading = page.locator('.de-document-editor__content h1').first();
  await heading.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' tested');
  await expect(heading).toHaveText('Canvas editing tested');
  const pages = page.locator('.de-document-editor__content .pm-page');
  const before = await pages.allTextContents();
  await choose(page, 'Renderer', 'DOM');
  await expect(page.locator('.de-document-editor__canvas')).toHaveCount(0);
  expect(await pages.allTextContents()).toEqual(before);
  await choose(page, 'Renderer', 'HTML-in-Canvas');
  await choose(page, 'Editor zoom', '125%');
  await expect(page).toHaveURL(/zoom=125/);
  await expectCanvasPixels(page.locator('.de-document-editor__canvas').first());
  expect(await pages.allTextContents()).toEqual(before);
  await page.getByRole('button', { name: 'Reset sample', exact: true }).click();
  await expect(heading).toHaveText('Canvas editing');
});

test('DOCE-LABS-3.8 reports native API fallback and keeps the document editable', async ({
  page,
  lab,
}) => {
  await page.addInitScript(() =>
    Reflect.deleteProperty(HTMLCanvasElement.prototype, 'requestPaint'),
  );
  await lab.open('canvas');
  await expect(page.getByLabel('Canvas diagnostics')).toContainText('unavailable; DOM fallback');
  await expect(page.locator('.de-document-editor__canvas')).toHaveCount(0);
  const heading = page.locator('.de-document-editor__content h1').first();
  await heading.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' fallback');
  await expect(heading).toHaveText('Canvas editing fallback');
});

test('DOCE-LABS-3.8 restores a rich sample and zoom from the URL', async ({ page }) => {
  await page.goto('canvas.html?rendering=dom&scenario=rich&zoom=125');
  await waitForLab(page);
  await expect(page.getByRole('button', { name: /Renderer$/ })).toContainText('DOM');
  await expect(page.getByRole('button', { name: /Sample document$/ })).toContainText(
    'Formatted and international text',
  );
  await expect(page.getByRole('button', { name: /Editor zoom$/ })).toContainText('125%');
  await expect(page.locator('.de-document-editor__content')).toContainText('café');
  await expect(page.locator('.de-document-editor__canvas')).toHaveCount(0);
  await choose(page, 'Renderer', 'HTML-in-Canvas');
  await expect(page.locator('.de-document-editor__canvas').first()).toBeVisible();
  await page.reload();
  await waitForLab(page);
  await expect(page.getByRole('button', { name: /Renderer$/ })).toContainText('HTML-in-Canvas');
  await expect(page.getByRole('button', { name: /Sample document$/ })).toContainText(
    'Formatted and international text',
  );
});

test('DOCE-LABS-3.8 releases distant bitmaps in the many-page sample', async ({ page, lab }) => {
  await lab.open('canvas');
  await choose(page, 'Sample document', 'Many pages');
  await expect(page.locator('.de-document-editor')).toHaveAttribute('data-layout-state', 'settled');
  const canvases = page.locator('.de-document-editor__canvas');
  await expect(async () => {
    const allocated = await canvases.evaluateAll(
      (elements) => elements.filter((element) => (element as HTMLCanvasElement).width > 0).length,
    );
    const count = await canvases.count();
    expect(count).toBeGreaterThan(10);
    expect(allocated).toBeGreaterThan(0);
    expect(allocated).toBeLessThan(count);
  }).toPass();
  await canvases.last().scrollIntoViewIfNeeded();
  await expect(async () => {
    expect(await canvases.first().evaluate((element) => (element as HTMLCanvasElement).width)).toBe(
      0,
    );
    expect(
      await canvases.last().evaluate((element) => (element as HTMLCanvasElement).width),
    ).toBeGreaterThan(0);
  }).toPass();
});

test('DOCE-LABS-3.8 compares real split planning and reports identical breaks', async ({
  page,
  lab,
}) => {
  await lab.open('canvas');
  await page.getByText('Text measurement comparison', { exact: true }).click();
  await page.getByRole('button', { name: 'Compare text splitting', exact: true }).click();
  const result = page.getByLabel('Text comparison result');
  await expect(result).toContainText('Page breaks match.');
  await expect(result).toContainText('Canvas text metrics used.');
  await expect(result).toContainText(/Median DOM: \d+\.\d+ ms; Canvas request: \d+\.\d+ ms/);
  await choose(page, 'Benchmark length', 'Short: 60 sentences');
  await expect(result).toHaveCount(0);
  await page.getByRole('button', { name: 'Compare text splitting', exact: true }).click();
  await expect(result).toContainText('Page breaks match.');
});

test('DOCE-LABS-3.8 refuses a comparison whose stylesheet changes its fixed geometry', async ({
  page,
  lab,
}) => {
  await lab.open('canvas');
  await page.addStyleTag({ content: '.lab-canvas-measure { width: 400px !important; }' });
  await page.getByText('Text measurement comparison', { exact: true }).click();
  await page.getByRole('button', { name: 'Compare text splitting', exact: true }).click();
  await expect(page.locator('.lab-canvas-comparison').getByRole('alert')).toHaveText(
    'Use the Reference stylesheet for this comparison.',
  );
  await expect(page.getByLabel('Text comparison result')).toHaveCount(0);
  await expect(page.locator('.lab-canvas-measure')).toHaveCount(0);
});
