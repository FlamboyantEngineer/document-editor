import type { Page } from '@playwright/test';
import { REGRESSION_DOCUMENTS } from '../labs/src/regression/regression-documents.js';
import type { RegressionProbe } from '../labs/src/regression/regression-probe.js';
import { expect, test, waitForLab } from './fixtures.js';
import { expectPrintEqualsEditor } from './print-fidelity.js';

const REGRESSION_NAMES = Object.keys(REGRESSION_DOCUMENTS);

// A window that shows a whole page, portrait or landscape, inside a lab's scrolling frame.
const ROOMY = { width: 1600, height: 1800 };

const content = (page: Page) => page.locator('.de-document-editor__content');

// The size of each sheet of a PDF, in points, in page order.
function sheetSizes(pdf: Buffer): string[] {
  const boxes = pdf.toString('latin1').matchAll(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/g);
  return [...boxes].map(([, width = '', height = '']) =>
    Number(width) > Number(height) ? 'landscape' : 'portrait',
  );
}

test.describe('print', () => {
  test('DOCE-EDITOR-6.14 DOCE-EDITOR-6.15 prints each section on its sheet, without view-only decorations', async ({
    lab,
    page,
    context,
  }) => {
    await lab.open('print');
    await expect(content(page).locator('[data-proofing-issue]', { hasText: 'teh' })).toHaveCount(1);
    await content(page).locator('h1', { hasText: 'Scope' }).click();
    await page.keyboard.press('ControlOrMeta+f');
    await page
      .getByRole('searchbox', { name: 'Find in document' })
      .or(page.getByRole('textbox', { name: 'Find in document' }))
      .fill('limits');
    await expect
      .poll(() => content(page).locator('[data-search-match]').count())
      .toBeGreaterThan(0);
    await page.getByRole('checkbox', { name: 'Show the layout debugging' }).check();
    await expect(content(page).locator('.pm-page').first()).toHaveAttribute('data-debug-used');
    const sections = await content(page)
      .locator('.pm-section')
      .evaluateAll((elements) =>
        elements.map((section) => section.querySelectorAll('.pm-page').length),
      );

    await page.getByRole('button', { name: 'Make a print preview' }).click();
    const snapshot = (await page.getByTitle('Print preview').getAttribute('srcdoc')) ?? '';
    for (const hook of [
      'data-search-match',
      'data-proofing-issue',
      'data-debug',
      'data-debug-used',
      'data-de-view-only',
    ]) {
      expect(snapshot).not.toContain(`${hook}=`);
    }

    const printed = await context.newPage();
    await printed.setContent(snapshot, { waitUntil: 'load' });
    const sheets = sheetSizes(await printed.pdf({ preferCSSPageSize: true }));
    expect(sheets).toEqual([
      ...Array<string>(sections[0] ?? 0).fill('portrait'),
      ...Array<string>(sections[1] ?? 0).fill('landscape'),
    ]);
    await printed.close();
  });
});

test.describe('print a comparison', () => {
  test('DOCE-EDITOR-6.17 prints the deleted text and change bars of a comparison', async ({
    lab,
    page,
    context,
  }) => {
    await lab.open('print');
    await content(page).locator('h1', { hasText: 'Scope' }).click();
    await page.keyboard.press('End');
    for (let index = 0; index < 3; index += 1) await page.keyboard.press('Backspace');
    await page.keyboard.type('ale');
    await page.getByRole('checkbox', { name: 'Compare with the document as it opened' }).check();
    await expect(content(page).locator('del[data-diff-change="deletion"]')).toHaveText('Scope');
    await expect(content(page).locator('.de-change-lines__line').first()).toBeAttached();

    await page.getByRole('button', { name: 'Make a print preview' }).click();
    const snapshot = (await page.getByTitle('Print preview').getAttribute('srcdoc')) ?? '';
    const printed = await context.newPage();
    await printed.emulateMedia({ media: 'print' });
    await printed.setContent(snapshot, { waitUntil: 'load' });
    await expect(printed.locator('del[data-diff-change="deletion"]')).toHaveText('Scope');
    const bar = printed.locator('.de-change-lines__line').first();
    await expect(bar).toBeAttached();
    const look = await bar.evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, adjust: style.printColorAdjust };
    });
    expect(look.background).not.toBe('rgba(0, 0, 0, 0)');
    expect(look.adjust).toBe('exact');
    await printed.close();
  });
});

test.describe('print equals the editor', () => {
  // Each case screenshots, prints and compares every page; CI runners are several times slower.
  test.describe.configure({ timeout: 120_000 });

  test('DOCE-EDITOR-6.19 prints the print lab as the editor shows it', async ({
    page,
    context,
  }) => {
    await page.setViewportSize(ROOMY);
    await page.goto('print.html');
    await waitForLab(page);
    await expectPrintEqualsEditor(page, context, async () => {
      await page.getByRole('button', { name: 'Make a print preview' }).click();
      return (await page.getByTitle('Print preview').getAttribute('srcdoc')) ?? '';
    });
  });

  for (const name of REGRESSION_NAMES) {
    test(`DOCE-EDITOR-6.19 DOCE-LABS-4.1 prints regression document ${name} as the editor shows it`, async ({
      page,
      context,
    }) => {
      await page.setViewportSize(ROOMY);
      await page.goto(`regression.html?document=${name}`);
      await waitForLab(page);
      await expectPrintEqualsEditor(page, context, async () => {
        const stylesheet = new URL('build/reference.css', page.url()).href;
        const html = await page.evaluate(
          (href) =>
            (window as unknown as { regressionLab: RegressionProbe }).regressionLab.snapshot({
              stylesheets: [href],
            }),
          stylesheet,
        );
        return html ?? '';
      });
    });
  }
});
