import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const content = (page: Page) => page.locator('.de-document-editor__content');
const issue = (page: Page, text: string) =>
  content(page).locator('[data-proofing-issue]', { hasText: text });
const status = (page: Page) => page.locator('.de-document-editor__proofing-status');
const menu = (page: Page) => page.getByRole('menu', { name: 'Document actions' });

// Opens the context menu inside a marked word.
async function openMenuOn(page: Page, text: string) {
  await issue(page, text).scrollIntoViewIfNeeded();
  const box = await issue(page, text).boundingBox();
  if (!box) throw new Error('The issue is not drawn');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
  await expect(menu(page)).toBeVisible();
}

test.describe('proofing', () => {
  test('DOCE-PROOFING-3.1 marks the issues the proofer finds and counts them', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    await expect(issue(page, 'teh')).toHaveAttribute('data-proofing-issue', 'spelling');
    await expect(issue(page, 'a error')).toHaveAttribute('data-proofing-issue', 'grammar');
    await expect(issue(page, 'recieve')).toHaveCount(1);
    await expect(status(page)).toHaveText('3 issues');
    await status(page).click();
    await expect(content(page)).toBeFocused();
    const selected = await page.evaluate(() => document.getSelection()?.toString());
    expect(selected).toBe('teh');
  });

  test('DOCE-PROOFING-3.2 corrects, ignores and adds words from the context menu', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    await openMenuOn(page, 'teh');
    await expect(menu(page).getByRole('group', { name: 'Spelling' })).toBeVisible();
    await menu(page).getByRole('menuitem', { name: 'the', exact: true }).click();
    await expect(content(page)).toContainText('the proofer suggests');
    await expect(issue(page, 'teh')).toHaveCount(0);
    await openMenuOn(page, 'a error');
    await expect(menu(page).getByRole('menuitem', { name: 'Add to dictionary' })).toHaveCount(0);
    await menu(page).getByRole('menuitem', { name: 'Ignore' }).click();
    await expect(issue(page, 'a error')).toHaveCount(0);
    await openMenuOn(page, 'recieve');
    await menu(page).getByRole('menuitem', { name: 'Add to dictionary' }).click();
    await expect(issue(page, 'recieve')).toHaveCount(0);
    await expect(status(page)).toHaveText('No issues');
    // A misspelling typed later, at the end of the paragraph holding the caret, is checked too.
    await page.keyboard.press('End');
    await page.keyboard.type(' Keep seperate notes.');
    await expect(issue(page, 'seperate')).toHaveCount(1);
  });
});
