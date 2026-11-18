import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const status = (page: Page) => page.getByLabel('Session status');
const editor = (page: Page) => page.getByRole('textbox', { name: 'Sample document' });

// Types at the end of the paragraph, placing the caret by clicking past its text, once the load is
// over: the document is out of reach until its pages are first laid out (DOCE-EDITOR-4.27).
async function typeAtEnd(page: Page, value: string) {
  await expect(page.getByRole('progressbar')).toHaveCount(0);
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

  test('DOCE-OBJECTS-2.5 keeps a figure caption edited in place across a reopen', async ({
    lab,
    page,
  }) => {
    await lab.open('session');
    await expect(page.getByRole('progressbar')).toHaveCount(0);
    const text = editor(page).locator('figure figcaption .doc-caption-text').first();
    await text.scrollIntoViewIfNeeded();
    const box = await text.boundingBox();
    if (!box) throw new Error('The caption is not drawn');
    // A press at the start of its text puts the caret there; what is typed is the document's.
    await page.mouse.click(box.x + 1, box.y + box.height / 2);
    await page.keyboard.press('Home');
    await page.keyboard.type('Main ');
    await page.keyboard.press('Enter');
    await expect(text).toHaveText('Main Fault panel');
    await expect(status(page)).toHaveText('ready · saved');
    await page.getByRole('button', { name: 'Reopen' }).click();
    await expect(editor(page).locator('figure .doc-caption-text')).toHaveText('Main Fault panel');
  });

  test('DOCE-FOOTNOTES-1.1 DOCE-SESSION-2.3 keeps footnotes, an empty one too, across a reopen', async ({
    lab,
    page,
  }) => {
    await lab.open('session');
    await typeAtEnd(page, ' Noted');
    await page.keyboard.press('ControlOrMeta+Alt+f');
    await page.keyboard.type('Within the cycle.');
    await editor(page).locator('.pm-footnote-entry').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Go to footnote reference' }).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' and kept');
    await page.keyboard.press('ControlOrMeta+Alt+f');
    const entries = editor(page).locator('.pm-footnote-entry');
    await expect(entries).toHaveCount(2);
    await expect(status(page)).toHaveText('ready · saved');
    await page.getByRole('button', { name: 'Reopen' }).click();
    await expect(editor(page).locator('.footnote-reference')).toHaveCount(2);
    await expect(entries).toHaveCount(2);
    await expect(entries.filter({ hasText: 'Within the cycle.' })).toHaveCount(1);
    await expect(entries.filter({ hasNotText: 'Within' })).toHaveCount(1);
  });

  test('DOCE-SESSION-2.2 reports a failed save and saves on retry', async ({ lab, page }) => {
    await lab.open('session');
    await page.getByRole('button', { name: 'Fail next save' }).click();
    await typeAtEnd(page, ' Twice.');
    await expect(status(page)).toHaveText('ready · error · unavailable');
    await page.getByRole('button', { name: 'Save now' }).click();
    await expect(status(page)).toHaveText('ready · saved');
  });

  test('DOCE-SESSION-4.1 DOCE-SESSION-7.1 merges another writer’s change to another block and keeps the caret', async ({
    lab,
    page,
  }) => {
    await lab.open('session');
    await page.getByLabel('Save automatically').uncheck();
    await typeAtEnd(page, ' Always.');
    // A click event without a press, so focus and the caret stay in the editor.
    await page
      .getByRole('button', { name: 'Another writer edits the heading' })
      .dispatchEvent('click');
    await expect(editor(page)).toContainText('Scope and purpose');
    await expect(editor(page)).toContainText('within one second. Always.');
    await page.keyboard.type(' Again.');
    await expect(editor(page)).toContainText('within one second. Always. Again.');
    await page.getByRole('button', { name: 'Save now' }).click();
    await expect(status(page)).toHaveText('ready · saved');
    await page.getByRole('button', { name: 'Reopen' }).click();
    await expect(editor(page)).toContainText('Scope and purpose');
    await expect(editor(page)).toContainText('Always. Again.');
  });

  test('DOCE-SESSION-4.3 asks about a block both changed and keeps both', async ({ lab, page }) => {
    await lab.open('session');
    await page.getByLabel('Save automatically').uncheck();
    await typeAtEnd(page, ' Late.');
    await page.getByRole('button', { name: 'Another writer edits the paragraph' }).click();
    const prompt = page.getByRole('region', { name: 'Changes saved by another writer' });
    await expect(prompt).toContainText('Another writer changed this block too');
    await expect(status(page)).toHaveText('ready · error · conflict');
    await prompt.getByRole('button', { name: 'Keep both' }).click();
    await expect(prompt).toBeHidden();
    await expect(editor(page)).toContainText('within one second. Late.');
    await expect(editor(page)).toContainText('within two seconds.');
    await page.getByRole('button', { name: 'Save now' }).click();
    await expect(status(page)).toHaveText('ready · saved');
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

  test('DOCE-SESSION-9.4 DOCE-SESSION-9.5 DOCE-SESSION-9.8 shows load progress and measures the load', async ({
    lab,
    page,
  }) => {
    await lab.open('session');
    await page.getByLabel('Latency').selectOption('1500');
    await page.getByRole('button', { name: 'Reopen' }).click();
    await expect(page.getByText('Loading the document')).toBeVisible();
    await expect(page.getByRole('progressbar')).toHaveAttribute(
      'aria-valuetext',
      /^Estimated progress: \d+%$/,
    );
    await expect(editor(page)).toBeVisible();
    await expect(page.getByRole('progressbar')).toHaveCount(0);
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
