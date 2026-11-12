import type { Page } from '@playwright/test';
import { expect, test, waitForLab } from './fixtures.js';

const content = (page: Page) => page.locator('.de-document-editor__content');

// The full editor lab, its pages a projection of the whole document as by default.
async function openProjected(page: Page) {
  await page.goto('full-editor.html');
  await waitForLab(page);
  await expect(content(page).locator('.pm-page').first()).toBeVisible();
}

test.describe('DocumentEditor on the projection', () => {
  test('DOCE-PAGINATION-7.17 types, splits and formats on the pages', async ({ lab, page }) => {
    await openProjected(page);
    await content(page).locator('h1', { hasText: 'Power' }).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' supply');
    await expect(content(page).locator('h1', { hasText: 'Power supply' })).toHaveCount(1);
    // Enter leaves the caret in the new paragraph after the heading.
    await page.keyboard.press('Enter');
    await page.keyboard.type('Projected text');
    await expect(content(page).locator('p', { hasText: 'Projected text' })).toHaveCount(1);
    // Formatting and undo act on the whole document.
    await page.keyboard.press('Shift+Home');
    await page.keyboard.press('ControlOrMeta+b');
    await expect(content(page).locator('strong', { hasText: 'Projected text' })).toHaveCount(1);
    await page.keyboard.press('ControlOrMeta+z');
    await expect(content(page).locator('strong', { hasText: 'Projected text' })).toHaveCount(0);
    await expect(content(page).locator('p', { hasText: 'Projected text' })).toHaveCount(1);
    expect(lab.errors).toEqual([]);
  });

  test('DOCE-PAGINATION-7.17 types math on the pages', async ({ page }) => {
    await openProjected(page);
    await content(page).locator('h1', { hasText: 'Power' }).click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    const before = await content(page).locator('.de-math').count();
    await page.keyboard.type('Energy $E=mc^2$');
    await expect(content(page).locator('.de-math')).toHaveCount(before + 1);
  });

  test('DOCE-PAGINATION-7.17 edits math in place on a double click on the pages', async ({
    page,
  }) => {
    await openProjected(page);
    await content(page).locator('h1', { hasText: 'Power' }).click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Gain is $k^2$ now');
    const math = content(page).locator('p', { hasText: 'now' }).locator('.de-math');
    await expect(math).toHaveAttribute('data-state', 'ready');
    await math.dblclick();
    const field = page
      .locator('.de-object-editors__field[data-kind="math"]')
      .getByRole('textbox', { name: 'LaTeX' });
    await expect(field).toHaveValue('k^2');
  });

  test('DOCE-PAGINATION-7.17 turns typing on the pages into suggestions while suggesting', async ({
    page,
  }) => {
    await openProjected(page);
    await page.getByLabel('Suggesting').check();
    await content(page).locator('h1', { hasText: 'Timing' }).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' plan');
    await expect(content(page).locator('h1 ins', { hasText: 'plan' })).toHaveCount(1);
  });

  test('DOCE-PAGINATION-7.17 DOCE-OBJECTS-3.3 paints code highlights on every page shown', async ({
    page,
  }) => {
    await page.goto('regression.html?document=code-blocks&layout=page');
    await waitForLab(page);
    const pages = content(page).locator('.pm-page');
    await expect(pages.first()).toBeVisible();
    // The text of a kind's ranges painted on a page the editor shows, not the measuring view.
    const painted = (index: number, name: string) =>
      pages
        .nth(index)
        .evaluate(
          (shown, highlight) =>
            [...(CSS.highlights.get(highlight) ?? [])]
              .filter((range) => range instanceof Range && shown.contains(range.startContainer))
              .map((range) => String(range)),
          name,
        );
    await expect.poll(() => painted(0, 'de-code-keyword')).toContain('const');
    // A listing split across pages is painted on its last page too.
    const last = (await pages.count()) - 1;
    expect(last).toBeGreaterThan(0);
    await expect
      .poll(async () => (await painted(last, 'de-code-number')).length)
      .toBeGreaterThan(0);
  });
});
