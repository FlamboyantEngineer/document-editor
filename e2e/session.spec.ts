import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const status = (page: Page) => page.getByLabel('Session status');
const editor = (page: Page) => page.getByRole('textbox', { name: 'Sample document' });

// Types at the end of the paragraph, placing the caret by clicking past its text.
async function typeAtEnd(page: Page, value: string) {
  const paragraph = editor(page).locator('p', { hasText: 'report each fault' });
  const box = await paragraph.boundingBox();
  if (!box) throw new Error('The paragraph is not shown.');
  await page.mouse.click(box.x + box.width - 2, box.y + box.height / 2);
  await page.keyboard.type(value);
}

test.describe('session lab', () => {
  test('DOCE-SESSION-1.1 DOCE-SESSION-2.3 loads, saves by itself and reloads from the store', async ({
    lab,
    page,
  }) => {
    await lab.open('session');
    await expect(status(page)).toHaveText('ready · idle');
    await typeAtEnd(page, ' Always.');
    await expect(status(page)).toHaveText('ready · dirty');
    await expect(status(page)).toHaveText('ready · saved');
    await page.getByRole('button', { name: 'Reopen' }).click();
    await expect(editor(page)).toContainText('Always.');
    await expect(status(page)).toHaveText('ready · idle');
  });

  test('DOCE-SESSION-2.2 reports a failed save and saves on retry', async ({ lab, page }) => {
    await lab.open('session');
    await page.getByRole('button', { name: 'Fail next save' }).click();
    await typeAtEnd(page, ' Twice.');
    await expect(status(page)).toHaveText('ready · error · unavailable');
    await page.getByRole('button', { name: 'Save now' }).click();
    await expect(status(page)).toHaveText('ready · saved');
  });

  test('DOCE-SESSION-2.2 reports a conflict when another writer saved first', async ({
    lab,
    page,
  }) => {
    await lab.open('session');
    await page.getByRole('button', { name: 'Save as another writer' }).click();
    await typeAtEnd(page, ' Late.');
    await expect(status(page)).toHaveText('ready · error · conflict');
  });

  test('DOCE-SESSION-5.2 flushes when the page is hidden', async ({ lab, page }) => {
    await lab.open('session');
    await page.getByLabel('Latency').selectOption('1500');
    await typeAtEnd(page, ' Hidden.');
    await page.getByRole('button', { name: 'Hide page' }).click();
    await expect(status(page)).toHaveText('ready · saving');
    await expect(status(page)).toHaveText('ready · saved');
  });
});

test.describe('session status UI', () => {
  const saveItem = (page: Page) =>
    page.locator('.de-document-editor__status-item[data-status="save"]');

  test('DOCE-SESSION-9.1 shows the save status and retries a failed save', async ({
    lab,
    page,
  }) => {
    await lab.open('session');
    await page.getByRole('button', { name: 'Fail next save' }).click();
    await typeAtEnd(page, ' Again.');
    await expect(status(page)).toHaveText('ready · error · unavailable');
    await saveItem(page).getByRole('button', { name: 'Retry' }).click();
    await expect(status(page)).toHaveText('ready · saved');
    await expect(saveItem(page)).toContainText(/saved/i);
  });

  test('DOCE-SESSION-9.4 DOCE-SESSION-9.5 shows load progress and measures the load', async ({
    lab,
    page,
  }) => {
    await lab.open('session');
    await page.getByLabel('Latency').selectOption('1500');
    await page.getByRole('button', { name: 'Reopen' }).click();
    await expect(page.getByText('Loading the document')).toBeVisible();
    await expect(editor(page)).toBeVisible();
    await expect(page.getByLabel('Load measures')).toHaveText(
      'document-session.loading, document-session.load',
    );
  });

  test('DOCE-SESSION-9.6 asks before leaving unsaved changes and saves them', async ({
    lab,
    page,
  }) => {
    await lab.open('session');
    await page.getByLabel('Latency').selectOption('1500');
    await typeAtEnd(page, ' Kept.');
    await page.getByRole('button', { name: 'Leave' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('Sample document');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByLabel('Left')).toHaveText('Left the document');
    await expect(status(page)).toHaveText('ready · saved');
  });
});
