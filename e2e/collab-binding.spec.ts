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

test.describe('collaboration binding spike', () => {
  test('P0-10 two people type, see each other’s carets and undo only their own changes', async ({
    lab,
    page,
  }) => {
    await lab.open('collab-binding');
    const ada = editor(page, 'Ada Lovelace');
    const grace = editor(page, 'Grace Hopper');
    await ada.getByText('Type in either one.').click();
    await page.keyboard.press('End');
    await page.keyboard.type(' Ada was here.');
    await expect(grace).toContainText('Ada was here.');
    await grace.getByText('only that person’s changes.').click();
    await page.keyboard.press('End');
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
    const ada = editor(page, 'Ada Lovelace');
    const grace = editor(page, 'Grace Hopper');
    await pane(page, 'Grace Hopper').getByLabel('Online').uncheck();
    await expect(pane(page, 'Grace Hopper').locator('output[name="status"]')).toHaveText(
      /disconnected/,
    );
    await ada.getByText('Shared notes').click();
    await page.keyboard.press('End');
    await page.keyboard.type(' (online)');
    await grace.getByText('Shared notes').click();
    await page.keyboard.press('Home');
    await page.keyboard.type('Offline: ');
    await expect(grace).not.toContainText('(online)');
    await pane(page, 'Grace Hopper').getByLabel('Online').check();
    for (const name of ['Grace Hopper', 'Ada Lovelace'])
      await expect.poll(() => textOf(page, name)).toContain('Offline: Shared notes (online)');
  });
});
