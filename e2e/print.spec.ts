import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

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
