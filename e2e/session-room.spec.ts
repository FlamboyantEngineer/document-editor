import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const status = (page: Page, name: string) => page.getByLabel(`${name}'s status`);
const editor = (page: Page, name: string) =>
  page.getByRole('textbox', { name: `${name}'s document` });
const SENTENCE = 'The system shall report each fault within one second.';
// A reader's paragraph, compared whole so a change sent twice shows (DOCE-COLLAB-4.1).
const paragraph = (page: Page, name: string) =>
  editor(page, name).locator('p', { hasText: 'report each fault' });

// Types at the end of a reader's paragraph, placing the caret by clicking past its text.
async function typeAtEnd(page: Page, name: string, value: string) {
  const box = await paragraph(page, name).boundingBox();
  if (!box) throw new Error('The paragraph is not shown.');
  await page.mouse.click(box.x + box.width - 2, box.y + box.height / 2);
  await page.keyboard.type(value);
}

test.describe('session in a room lab', () => {
  test('DOCE-SESSION-3.2 DOCE-SESSION-3.3 DOCE-COLLAB-4.1 keeps two readers on one document', async ({
    lab,
    page,
  }) => {
    await lab.open('session-room');
    await expect(status(page, 'Ada')).toHaveText(/^ready · /);
    await expect(status(page, 'Grace')).toHaveText(/^ready · /);
    await typeAtEnd(page, 'Ada', ' Always.');
    await expect(paragraph(page, 'Grace')).toHaveText(`${SENTENCE} Always.`);
    await expect(paragraph(page, 'Ada')).toHaveText(`${SENTENCE} Always.`);
    await expect(status(page, 'Ada')).toHaveText('ready · saved');
  });

  test('DOCE-SESSION-3.3 keeps an offline reader’s changes until they come back', async ({
    lab,
    page,
  }) => {
    await lab.open('session-room');
    await expect(status(page, 'Ada')).toHaveText(/^ready · /);
    const ada = page.getByRole('region', { name: 'Ada' });
    await ada.getByRole('button', { name: 'Go offline' }).click();
    await expect(status(page, 'Ada')).toHaveText('ready · offline');
    await typeAtEnd(page, 'Ada', ' Later.');
    await expect(editor(page, 'Ada')).toContainText('Later.');
    await expect(editor(page, 'Grace')).not.toContainText('Later.');
    await ada.getByRole('button', { name: 'Go online' }).click();
    await expect(paragraph(page, 'Grace')).toHaveText(`${SENTENCE} Later.`);
    await expect(paragraph(page, 'Ada')).toHaveText(`${SENTENCE} Later.`);
    await expect(status(page, 'Ada')).toHaveText('ready · saved');
  });
});
