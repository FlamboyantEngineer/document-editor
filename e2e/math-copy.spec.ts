import type { Page } from '@playwright/test';
import type { RegressionProbe } from '../labs/src/regression/regression-probe.js';
import type { DocumentFile } from '../src/model/index.js';
import { expect, test, waitForLab } from './fixtures.js';

// Copying math from the context menu (specs/OBJECTS.md DOCE-OBJECTS-1.12): as an equation that
// pastes back as math, as its LaTeX, and as an image of the drawing the math layout made.

declare global {
  interface Window {
    regressionLab: RegressionProbe;
  }
}

const SOURCE = String.raw`\frac{a}{b}`;
const EDITOR =
  ':not(.de-document-viewer) > .de-document-editor__content:not(.de-document-editor__measure *)';
const item = (page: Page, name: string) =>
  page.getByRole('menu').last().getByRole('menuitem', { name, exact: true });

const DOCUMENT = {
  formatVersion: 1,
  sections: [
    {
      name: null,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'The ratio ' },
            { type: 'math', attrs: { source: SOURCE } },
            { type: 'text', text: ' holds.' },
          ],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'Again' }] },
      ],
    },
  ],
} as DocumentFile;

// What the clipboard holds: its text formats, and an image's size in pixels.
const readClipboard = (page: Page) =>
  page.evaluate(async () => {
    const formats: Record<string, string> = {};
    for (const entry of await navigator.clipboard.read())
      for (const type of entry.types) {
        const blob = await entry.getType(type);
        if (type !== 'image/png') formats[type] = await blob.text();
        else {
          const image = await createImageBitmap(blob);
          formats[type] = `${String(image.width)}x${String(image.height)}`;
        }
      }
    return formats;
  });

test.describe('math copy', () => {
  test('DOCE-OBJECTS-1.12 copies math as an equation, as LaTeX and as an image, and pastes it back as math', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('regression.html?document=minimal-paragraph&textLayout=pretext&debug');
    await waitForLab(page);
    await page.evaluate((stored) => window.regressionLab.load(stored), DOCUMENT);
    const math = page.locator(`${EDITOR} .de-math`);
    await expect(math).toHaveAttribute('data-math-layout', 'laid');

    await math.click({ button: 'right' });
    await item(page, "Copy equation's LaTeX").click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(SOURCE);

    await math.click({ button: 'right' });
    await item(page, 'Copy equation as image').click();
    const drawn = await math.locator('svg.de-math__drawing').boundingBox();
    await expect(async () => {
      const image = await readClipboard(page);
      expect(image).toHaveProperty('image/png');
      const [width, height] = (image['image/png'] ?? '').split('x').map(Number);
      expect(Math.abs((width ?? 0) - 2 * (drawn?.width ?? 0))).toBeLessThanOrEqual(2);
      expect(Math.abs((height ?? 0) - 2 * (drawn?.height ?? 0))).toBeLessThanOrEqual(2);
      expect(image['text/html']).toMatch(/^<img src="data:image\/png;base64,/);
    }).toPass({ timeout: 10_000 });

    await math.click({ button: 'right' });
    await item(page, 'Copy equation').click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toContain(`<annotation encoding="application/x-tex">${SOURCE}</annotation>`);
    await page.locator(EDITOR).getByText('Again').click();
    await page.keyboard.press('End');
    await page.keyboard.press('ControlOrMeta+v');
    await expect(math).toHaveCount(2);
    await expect(math.last()).toHaveAttribute('data-math-layout', 'laid');
  });
});
