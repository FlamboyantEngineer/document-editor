import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const status = (page: Page, name: string) => page.getByLabel(`${name}'s status`);
const editor = (page: Page, name: string) =>
  page.getByRole('textbox', { name: `${name}'s document` });

// Types at the end of a reader's paragraph, placing the caret by clicking past its text.
async function typeAtEnd(page: Page, name: string, value: string) {
  const paragraph = editor(page, name).locator('p', { hasText: 'report each fault' });
  const box = await paragraph.boundingBox();
  if (!box) throw new Error('The paragraph is not shown.');
  await page.mouse.click(box.x + box.width - 2, box.y + box.height / 2);
  await page.keyboard.type(value);
}

test.describe('session in a room lab', () => {
  test('DOCE-SESSION-3.2 DOCE-SESSION-3.3 keeps two readers on one document', async ({
    lab,
    page,
  }) => {
    await lab.open('session-room');
    await expect(status(page, 'Ada')).toHaveText(/^ready · /);
    await expect(status(page, 'Grace')).toHaveText(/^ready · /);
    await typeAtEnd(page, 'Ada', ' Always.');
    await expect(editor(page, 'Grace')).toContainText('Always.');
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
    await expect(editor(page, 'Grace')).toContainText('Later.');
    await expect(status(page, 'Ada')).toHaveText('ready · saved');
  });
});
