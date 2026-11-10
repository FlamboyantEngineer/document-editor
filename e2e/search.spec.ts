import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const content = (page: Page) => page.locator('.de-document-editor__content');
const matches = (page: Page) => content(page).locator('[data-search-match]');

test.describe('find and replace', () => {
  test('DOCE-SEARCH-2.1 finds, steps through and replaces from the find bar', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    await content(page).locator('h1', { hasText: 'Timing' }).click();
    await page.keyboard.press('ControlOrMeta+f');
    const find = page
      .getByRole('searchbox', { name: 'Find in document' })
      .or(page.getByRole('textbox', { name: 'Find in document' }));
    await expect(find).toBeFocused();
    await find.fill('Maintenance');
    await expect.poll(() => matches(page).count()).toBeGreaterThan(1);
    const count = await matches(page).count();
    await expect(content(page).locator('[data-search-match="current"]')).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(content(page).locator('[data-search-match="current"]')).toHaveCount(1);
    await page.getByRole('textbox', { name: /Replace/ }).fill('Upkeep');
    await page.getByRole('button', { name: 'Replace all' }).click();
    await expect(matches(page)).toHaveCount(0);
    await expect(content(page).getByText('Upkeep')).toHaveCount(count);
    await find.press('Escape');
    await expect(find).toHaveCount(0);
    await expect(content(page)).toBeFocused();
  });
});
