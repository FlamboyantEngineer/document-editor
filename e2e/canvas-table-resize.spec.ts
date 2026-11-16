import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

test.use({
  viewport: { width: 1500, height: 1200 },
  deviceScaleFactor: 1,
  launchOptions: {
    executablePath: process.env.CHROMIUM_PATH,
    args: ['--enable-blink-features=CanvasDrawElement'],
  },
});

async function choose(page: Page, label: string, option: string) {
  await page.getByRole('button', { name: new RegExp(`${label}$`) }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
}

async function box(cell: Locator) {
  return cell.evaluate((element) => {
    const { x, y, width, height, right, bottom } = element.getBoundingClientRect();
    return { x, y, width, height, right, bottom };
  });
}

async function cancelRowPreview(page: Page, cell: Locator) {
  const before = await box(cell);
  const saved = await cell.getAttribute('data-row-height');
  const x = before.x + before.width / 2;
  const y = before.bottom - 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 20, { steps: 3 });
  await expect(async () => {
    expect(Math.abs((await box(cell)).height - before.height - 20)).toBeLessThan(2);
  }).toPass();
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(async () => {
    expect(await cell.getAttribute('data-row-height')).toBe(saved);
    expect(Math.abs((await box(cell)).height - before.height)).toBeLessThan(2);
  }).toPass();
}

async function resize(page: Page, cell: Locator, axis: 'column' | 'row') {
  const before = await box(cell);
  const dimension = axis === 'column' ? 'width' : 'height';
  const attribute = axis === 'column' ? 'data-colwidth' : 'data-row-height';
  const original = await cell.getAttribute(attribute);
  const x = axis === 'column' ? before.right - 1 : before.x + before.width / 2;
  const y = axis === 'row' ? before.bottom - 2 : before.y + before.height / 2;
  const step = axis === 'column' ? -30 : 20;
  await page.mouse.move(x - 10, y - 10);
  await page.mouse.move(x, y, { steps: 3 });
  await page.mouse.down();
  for (const distance of [step, step * 2]) {
    await page.mouse.move(
      x + (axis === 'column' ? distance : 0),
      y + (axis === 'row' ? distance : 0),
      { steps: 3 },
    );
    // Check the displayed cell before mouseup; saved attributes alone miss lost previews.
    await expect(async () => {
      expect(Math.abs((await box(cell))[dimension] - before[dimension] - distance)).toBeLessThan(2);
    }).toPass();
    expect(await cell.getAttribute(attribute)).toBe(original);
  }
  await page.mouse.up();
  await expect(cell).toHaveAttribute(attribute, /\d+/);
  await expect(async () => {
    expect(Math.abs((await box(cell))[dimension] - before[dimension] - step * 2)).toBeLessThan(2);
  }).toPass();
  if (axis === 'row') await cancelRowPreview(page, cell);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(async () => {
    expect(await cell.getAttribute(attribute)).toBe(original);
    expect(Math.abs((await box(cell))[dimension] - before[dimension])).toBeLessThan(2);
  }).toPass();
}

for (const rendering of ['DOM', 'HTML-in-Canvas']) {
  for (const zoom of [75, 100, 125]) {
    test(`DOCE-TABLES-2.4 DOCE-TABLES-3.6 resizes columns and rows live in ${rendering} at ${String(zoom)}% with one-step undo`, async ({
      page,
      lab,
    }) => {
      await lab.open('canvas');
      await choose(page, 'Renderer', rendering);
      await choose(page, 'Editor zoom', `${String(zoom)}%`);
      await expect(page.locator('.de-document-editor')).toHaveAttribute(
        'data-layout-state',
        'settled',
      );
      if (rendering === 'HTML-in-Canvas')
        await expect(page.locator('.de-document-editor__canvas').first()).toBeVisible();
      const cell = page
        .locator('.de-document-editor__content td')
        .filter({ hasText: /^Start$/ })
        .first();
      await cell.scrollIntoViewIfNeeded();
      await cell.click();
      await resize(page, cell, 'column');
      await resize(page, cell, 'row');
    });
  }
}

test('DOCE-EDITOR-1.9 shows the same page edge in Canvas and DOM modes', async ({ page, lab }) => {
  await lab.open('canvas');
  const canvas = page.locator('.de-document-editor__canvas').first();
  await expect(canvas).toBeVisible();
  const shadow = await canvas.evaluate((element) => getComputedStyle(element).boxShadow);
  expect(shadow).not.toBe('none');
  await choose(page, 'Renderer', 'DOM');
  const pageElement = page.locator('.de-document-editor__content .pm-page').first();
  await expect(pageElement).toHaveCSS('box-shadow', shadow);
});
