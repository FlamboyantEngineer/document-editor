import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const content = (page: Page) => page.locator('.de-document-editor__content');
const margin = (page: Page) => page.getByRole('list', { name: 'Comments' });

test.describe('full editor lab', () => {
  test('DOCE-LABS-3.2 brings comments, suggestions, proofing, find and the host together', async ({
    lab,
    page,
  }) => {
    await lab.open('full-editor');
    // The comment thread in the margin, and the suggestion in the text.
    await expect(margin(page)).toContainText('Does normal operation include start-up?');
    await expect(content(page).locator('ins', { hasText: 'each' })).toHaveCount(1);
    // The two proofers' issues, counted in the status bar.
    await expect(page.locator('.de-document-editor__proofing-status')).toHaveText('3 issues');
    // Suggesting turns typing into a suggestion by the writer.
    await page.getByLabel('Suggesting').check();
    await content(page).locator('h1', { hasText: 'Timing' }).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' plan');
    await expect(content(page).locator('h1 ins', { hasText: 'plan' })).toHaveCount(1);
    // Find in the document.
    await page.keyboard.press('ControlOrMeta+f');
    await page
      .getByRole('searchbox', { name: 'Find in document' })
      .or(page.getByRole('textbox', { name: 'Find in document' }))
      .fill('Maintenance');
    await expect
      .poll(() => content(page).locator('[data-search-match]').count())
      .toBeGreaterThan(0);
    // The host's own toolbar item and the agent.
    await expect(
      page.getByRole('toolbar', { name: 'Formatting' }).locator('[data-item="insert-date"]'),
    ).toHaveCount(1);
    await page.getByRole('button', { name: 'Rewrite a phrase' }).click();
    await expect(content(page).locator('ins', { hasText: 'operating state' })).toHaveCount(1);
  });
});
