// Spike (P0-10): two editors on one in-process collaboration-tools room server.

import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const pane = (page: Page, name: string) => page.getByRole('region', { name });
const editor = (page: Page, name: string) => pane(page, name).locator('.ProseMirror');

// An editor's text without the other person's caret label.
function textOf(page: Page, name: string) {
  return editor(page, name).evaluate((element) => {
    const copy = element.cloneNode(true) as HTMLElement;
    for (const caret of copy.querySelectorAll('.de-presence-caret')) caret.remove();
    return copy.textContent;
  });
}

// Puts the caret at the start or end of a text by clicking there. A key such as Home right after the
// click can race ProseMirror's focus handling, which writes its own selection back shortly after.
async function clickText(page: Page, name: string, text: string, side: 'start' | 'end') {
  const target = editor(page, name).getByText(text);
  const box = await target.boundingBox();
  if (!box) throw new Error(`${text} is not on screen`);
  await target.click({ position: { x: side === 'start' ? 1 : box.width - 1, y: box.height / 2 } });
}

test.describe('collaboration binding spike', () => {
  test('P0-10 two people type, see each other’s carets and undo only their own changes', async ({
    lab,
    page,
  }) => {
    await lab.open('collab-binding');
    const ada = editor(page, 'Ada Lovelace');
    const grace = editor(page, 'Grace Hopper');
    await clickText(page, 'Ada Lovelace', 'Type in either one.', 'end');
    await page.keyboard.type(' Ada was here.');
    await expect(grace).toContainText('Ada was here.');
    await clickText(page, 'Grace Hopper', 'only that person’s changes.', 'end');
    await page.keyboard.type(' Grace too.');
    await expect(ada).toContainText('Grace too.');
    await expect(ada.locator('.de-presence-caret__label')).toHaveText('Grace Hopper');
    await expect(grace.locator('.de-presence-caret__label')).toHaveText('Ada Lovelace');

    await pane(page, 'Ada Lovelace').getByRole('button', { name: 'Undo' }).click();
    await expect(grace).not.toContainText('Ada was here.');
    await expect(grace).toContainText('Grace too.');
    await expect(ada).toContainText('Grace too.');
  });

  test('P0-10 an editor taken offline catches up when it comes back', async ({ lab, page }) => {
    await lab.open('collab-binding');
    const grace = editor(page, 'Grace Hopper');
    await pane(page, 'Grace Hopper').getByLabel('Online').uncheck();
    await expect(pane(page, 'Grace Hopper').locator('output[name="status"]')).toHaveText(
      /disconnected/,
    );
    await clickText(page, 'Ada Lovelace', 'Shared notes', 'end');
    await page.keyboard.type(' (online)');
    await clickText(page, 'Grace Hopper', 'Shared notes', 'start');
    await page.keyboard.type('Offline: ');
    await expect(grace).not.toContainText('(online)');
    await pane(page, 'Grace Hopper').getByLabel('Online').check();
    for (const name of ['Grace Hopper', 'Ada Lovelace'])
      await expect.poll(() => textOf(page, name)).toContain('Offline: Shared notes (online)');
  });
});
