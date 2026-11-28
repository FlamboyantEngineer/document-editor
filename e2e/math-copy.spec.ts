import type { Page } from '@playwright/test';
import type { RegressionProbe } from '../labs/src/regression/regression-probe.js';
import type { DocumentFile } from '../src/model/index.js';
import { expect, test, waitForLab } from './fixtures.js';

// Copying math from the context menu (specs/OBJECTS.md DOCE-OBJECTS-1.12): as an equation that
// pastes back as math, as its LaTeX, and as an image of the drawing the math layout made, which
// carries the LaTeX and pastes back as math too.

declare global {
  interface Window {
    regressionLab: RegressionProbe;
  }
}

const SOURCE = String.raw`\frac{a}{b}`;
const EDITOR = ':not(.de-document-viewer) > .de-document-editor__content';
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

// The clipboard's text formats and the dimensions of its PNG image.
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
    await page.goto('regression.html?document=minimal-paragraph&debug');
    await waitForLab(page);
    await page.evaluate((stored) => window.regressionLab.load(stored), DOCUMENT);
    const math = page.locator(`${EDITOR} .de-math`);
    await expect(math).toHaveAttribute('data-math-layout', 'laid');

    await math.first().click({ button: 'right' });
    await item(page, "Copy equation's LaTeX").click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(SOURCE);

    await math.first().click({ button: 'right' });
    await item(page, 'Copy equation as image').click();
    const drawn = await math.first().locator('svg.de-math__drawing').boundingBox();
    await expect(async () => {
      const image = await readClipboard(page);
      expect(image).toHaveProperty('image/png');
      const [width, height] = (image['image/png'] ?? '').split('x').map(Number);
      expect(Math.abs((width ?? 0) - 2 * (drawn?.width ?? 0))).toBeLessThanOrEqual(2);
      expect(Math.abs((height ?? 0) - 2 * (drawn?.height ?? 0))).toBeLessThanOrEqual(2);
      expect(image['text/html']).toMatch(
        /^<img src="data:image\/png;base64,[^"]+".* data-latex="\\frac\{a\}\{b\}">$/,
      );
    }).toPass({ timeout: 10_000 });
    // The image pastes back as the equation it shows, not as a picture.
    const images = page.locator(`${EDITOR} img:not(.ProseMirror-separator)`);
    const imagesBefore = await images.count();
    await page.locator(EDITOR).getByText('Again').click();
    await page.keyboard.press('End');
    await page.keyboard.press('ControlOrMeta+v');
    await expect(math).toHaveCount(2);
    await expect(images).toHaveCount(imagesBefore);

    await math.first().click({ button: 'right' });
    await item(page, 'Copy equation').click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toContain(`<annotation encoding="application/x-tex">${SOURCE}</annotation>`);
    await page.locator(EDITOR).getByText('Again').click();
    await page.keyboard.press('End');
    await page.keyboard.press('ControlOrMeta+v');
    await expect(math).toHaveCount(3);
    await expect(math.last()).toHaveAttribute('data-math-layout', 'laid');
  });
});
