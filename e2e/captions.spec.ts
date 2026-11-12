import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const content = (page: Page) => page.locator('.de-document-editor__content');
const firstTable = (page: Page) => content(page).locator('table').first();
const item = (page: Page, name: string | RegExp) =>
  page.getByRole('menu').last().getByRole('menuitem', { name });

test.describe('captions', () => {
  test.beforeEach(async ({ lab }) => {
    await lab.open('full-editor');
  });

  test('DOCE-OBJECTS-2.2 shows a table caption line with its label, number and text', async ({
    page,
  }) => {
    const caption = firstTable(page).locator('caption');
    await expect(caption).toHaveText('Scope limits');
    const label = await caption.evaluate(
      (element) => getComputedStyle(element, '::before').content,
    );
    expect(label).toContain('Table');
    // A figure counts its own kind.
    const figureLabel = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.className = 'doc-caption-line doc-figure-caption-line';
      document.querySelector('.de-document-editor')?.appendChild(probe);
      const value = getComputedStyle(probe, '::before').content;
      probe.remove();
      return value;
    });
    expect(figureLabel).toContain('Figure');
  });

  test('DOCE-OBJECTS-2.1 edits and hides a caption from the context menu', async ({ page }) => {
    await firstTable(page).getByText('Start').click({ button: 'right' });
    await item(page, 'Edit caption…').click();
    const field = page.getByRole('dialog').getByRole('textbox', { name: 'Caption' });
    await expect(field).toHaveValue('Scope limits');
    await field.fill('Scope timing limits');
    await page.keyboard.press('Enter');
    await expect(firstTable(page).locator('caption')).toHaveText('Scope timing limits');
    await firstTable(page).getByText('Start').click({ button: 'right' });
    await item(page, 'Hide caption').click();
    await expect(firstTable(page).locator('caption')).toHaveCount(0);
    await expect(firstTable(page)).toHaveAttribute('data-caption-enabled', 'false');
  });

  test('DOCE-OBJECTS-2.3 edits a caption in place on a double click', async ({ page }) => {
    const caption = firstTable(page).locator('caption');
    const field = page
      .locator('.de-object-editors__field[data-kind="caption"]')
      .getByRole('textbox', { name: 'Caption' });
    await caption.dblclick();
    await expect(field).toBeFocused();
    await expect(field).toHaveValue('Scope limits');
    await expect(firstTable(page)).toHaveAttribute('data-caption-editing', 'true');
    // Select all stays in the field.
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('Scope timing limits');
    await page.keyboard.press('Enter');
    await expect(field).toHaveCount(0);
    await expect(caption).toHaveText('Scope timing limits');
    await expect(firstTable(page)).not.toHaveAttribute('data-caption-editing');
    // Escape leaves it as it was.
    await caption.dblclick();
    await page.keyboard.type(' draft');
    await page.keyboard.press('Escape');
    await expect(field).toHaveCount(0);
    await expect(caption).toHaveText('Scope timing limits');
  });

  test('DOCE-TABLES-3.1 aligns a cell from the context menu', async ({ page }) => {
    const cell = firstTable(page).locator('td', { hasText: '25 ms' });
    await cell.click({ button: 'right' });
    await item(page, 'Table').click();
    await item(page, 'Align cells').click();
    await item(page, 'Bottom right').click();
    await expect(cell).toHaveAttribute('data-text-align', 'right');
    await expect(cell).toHaveAttribute('data-vertical-align', 'bottom');
  });
});
