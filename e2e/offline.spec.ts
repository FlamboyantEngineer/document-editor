import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const status = (page: Page) => page.getByLabel('Session status');
const editor = (page: Page) => page.getByRole('textbox', { name: 'Sample document' });
const draft = (page: Page) => page.getByRole('status', { name: 'Draft' });

// Types at the end of the paragraph, placing the caret by clicking past its text.
async function typeAtEnd(page: Page, value: string) {
  const paragraph = editor(page).locator('p', { hasText: 'report each fault' });
  const box = await paragraph.boundingBox();
  if (!box) throw new Error('The paragraph is not shown.');
  await page.mouse.click(box.x + box.width - 2, box.y + box.height / 2);
  await page.keyboard.type(value);
}

// Whether the tab's session storage holds a store-mode draft with `value`.
const draftHolds = (page: Page, value: string) =>
  page.evaluate(
    (typed) => sessionStorage.getItem('offline-lab:store:lab')?.includes(typed) ?? false,
    value,
  );

// Types, waits for the draft to be kept, and reloads as a crash would.
async function crashAfterTyping(page: Page, value: string) {
  await typeAtEnd(page, value);
  await expect(status(page)).toHaveText('ready · dirty');
  await expect.poll(() => draftHolds(page, value)).toBe(true);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-lab-ready', 'true');
}

test.describe('offline lab', () => {
  test('DOCE-SESSION-6.2 offers the draft after a crash and restores it', async ({ lab, page }) => {
    await lab.open('offline');
    await expect(draft(page)).toHaveCount(0);
    await crashAfterTyping(page, ' Kept.');
    await expect(draft(page)).toBeVisible();
    await expect(editor(page)).not.toContainText('Kept.');
    await page.getByRole('button', { name: 'Restore draft' }).click();
    await expect(editor(page)).toContainText('Kept.');
    await expect(draft(page)).toHaveCount(0);
    await expect(status(page)).toHaveText('ready · dirty');
    await page.getByRole('button', { name: 'Save now' }).click();
    await expect(status(page)).toHaveText('ready · saved');
    await expect.poll(() => draftHolds(page, 'Kept.')).toBe(false);
  });

  test('DOCE-SESSION-6.5 discards the draft', async ({ lab, page }) => {
    await lab.open('offline');
    await crashAfterTyping(page, ' Dropped.');
    await page.getByRole('button', { name: 'Discard draft' }).click();
    await expect(draft(page)).toHaveCount(0);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-lab-ready', 'true');
    await expect(editor(page)).not.toContainText('Dropped.');
    await expect(draft(page)).toHaveCount(0);
  });
});
