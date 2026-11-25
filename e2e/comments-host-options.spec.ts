import type { Page } from '@playwright/test';
import { expect, test, waitForLab } from './fixtures.js';

// The comments lab's host options and its store's replies written for the reader (DOCE-LABS-3.10).

const content = (page: Page) => page.locator('.de-document-editor__content');
const margin = (page: Page) => page.getByRole('list', { name: 'Comments' });
const card = (page: Page, text: string) =>
  margin(page).locator(':scope > [role="listitem"]').filter({ hasText: text });
const firstThread = (page: Page) => card(page, 'Is one second measured');
const hostLog = (page: Page) => page.getByRole('status', { name: 'Host log' });
const options = (page: Page) => page.getByRole('group', { name: 'Host options' });

async function startThread(page: Page, quote: string, comment: string) {
  await content(page).getByText(quote).click();
  await page.keyboard.press('ControlOrMeta+Alt+m');
  await expect(margin(page).getByRole('textbox', { name: 'Add a comment' })).toBeFocused();
  await page.keyboard.type(comment);
  await margin(page).getByRole('button', { name: 'Comment' }).click();
  await expect(card(page, comment)).toBeVisible();
}

test.describe('comments lab host options', () => {
  test('DOCE-COMMENTS-2.1 sets the gap between the page and its cards', async ({ lab, page }) => {
    await lab.open('comments');
    const thread = page.locator('.de-document-comments__card').first();
    const left = async () => (await thread.boundingBox())?.x ?? Number.NaN;
    const before = await left();
    await options(page).getByLabel('Card gap').fill('60');
    // 20 pixels by default, so the cards move 40 pixels further from the page.
    await expect.poll(async () => Math.round((await left()) - before)).toBe(40);
  });

  test('DOCE-COMMENTS-2.33 DOCE-COMMENTS-2.4 ends the header menus with the host entries and deletes without asking', async ({
    lab,
    page,
  }) => {
    await lab.open('comments');
    await options(page).getByLabel('Share in the header menu').check();
    await firstThread(page).getByRole('button', { name: 'More actions' }).first().click();
    await page.getByRole('menuitem', { name: 'Share thread' }).click();
    await expect(hostLog(page)).toContainText('Shared c0ffee01');
    // The suggestion's card has its entry before it has a thread.
    await card(page, 'every').getByRole('button', { name: 'More actions' }).first().click();
    await page.getByRole('menuitem', { name: 'Share suggestion' }).click();
    await expect(hostLog(page)).toContainText('Shared a1b2c3d4');
    await options(page).getByLabel('Delete without asking').check();
    await startThread(page, 'Reports go to the operator console', 'Which log?');
    await card(page, 'Which log?').getByRole('button', { name: 'More actions' }).first().click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(card(page, 'Which log?')).toHaveCount(0);
  });

  test('DOCE-COMMENTS-2.29 starts each reply with the host text', async ({ lab, page }) => {
    await lab.open('comments');
    await options(page).getByLabel('Replies start with the quote').check();
    await firstThread(page).getByText('Is one second measured').click();
    const reply = firstThread(page).getByRole('textbox', { name: 'Reply' });
    await expect(reply).toHaveText('Re one second:');
  });

  test('DOCE-COMMENTS-2.37 makes no card active once focus leaves', async ({ lab, page }) => {
    await lab.open('comments');
    const thread = firstThread(page);
    await options(page).getByLabel('No active card once focus leaves').check();
    await firstThread(page).getByText('Is one second measured').click();
    await expect(thread).toHaveAttribute('data-active', 'true');
    await options(page).getByLabel('Card gap').focus();
    await expect(thread).not.toHaveAttribute('data-active');
  });

  test('DOCE-COMMENTS-2.31 lets a moderator change anyone comment', async ({ lab, page }) => {
    await lab.open('comments');
    // Grace's comment offers the reader nothing to change.
    await expect(firstThread(page).getByRole('button', { name: 'More actions' })).toHaveCount(0);
    await options(page).getByLabel('Moderator (reloads)').check();
    await page.waitForURL(/\?moderator$/);
    await waitForLab(page);
    await firstThread(page).getByRole('button', { name: 'More actions' }).first().click();
    await page.getByRole('menuitem', { name: 'Edit' }).click();
    // The card by the text it quotes, which the edit leaves.
    const thread = card(page, 'one second');
    await thread
      .getByRole('textbox', { name: 'Edit comment' })
      .fill('Measured from the detection.');
    await thread.getByRole('button', { name: 'Save' }).click();
    await expect(margin(page)).toContainText('Measured from the detection.');
  });

  test('DOCE-COMMENTS-2.17 DOCE-COMMENTS-2.28 shows a reply written for the reader and who is typing', async ({
    lab,
    page,
  }) => {
    await lab.open('comments');
    await options(page).getByRole('button', { name: 'Ask the assistant' }).click();
    await expect(firstThread(page)).toContainText('Helper is replying…');
    await expect(hostLog(page)).toContainText('Shown c0ffee01/answer-1');
    await options(page).getByRole('button', { name: 'Finish the answer' }).click();
    await expect(firstThread(page)).toContainText('From its detection');
    await expect(firstThread(page)).not.toContainText('Helper is replying…');
    await options(page).getByLabel('Grace is typing in the first thread').check();
    await expect(firstThread(page)).toContainText('Grace Hopper is typing…');
    await options(page).getByLabel('Grace is typing in the first thread').uncheck();
    await expect(firstThread(page)).not.toContainText('Grace Hopper is typing…');
  });

  test('DOCE-COMMENTS-2.26 retries a failed reply, and offers no retry once it failed for good', async ({
    lab,
    page,
  }) => {
    await lab.open('comments');
    const ask = options(page).getByRole('button', { name: 'Ask the assistant' });
    await ask.click();
    await options(page).getByRole('button', { name: 'Fail the answer', exact: true }).click();
    await expect(firstThread(page)).toContainText('The assistant could not answer.');
    await firstThread(page).getByRole('button', { name: 'Retry' }).click();
    await expect(firstThread(page)).toContainText('Helper is replying…');
    await options(page).getByRole('button', { name: 'Fail the answer for good' }).click();
    await expect(firstThread(page)).toContainText('The assistant could not answer.');
    await expect(firstThread(page).getByRole('button', { name: 'Retry' })).toHaveCount(0);
    await firstThread(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(firstThread(page)).not.toContainText('The assistant could not answer.');
  });

  test('DOCE-COMMENTS-4.7 DOCE-EDITOR-8.2 reveals the comments pane from the text and the handle', async ({
    lab,
    page,
  }) => {
    await lab.open('comments');
    await options(page).getByLabel('Threads reveal the comments pane').check();
    // The side panel starts collapsed, its panes behind launchers.
    const pane = page.getByRole('tabpanel', { name: /Comments/ });
    await expect(pane).toBeHidden();
    await content(page).locator('mark[data-comment-id]').first().click();
    await expect(pane).toBeVisible();
    const tab = page.getByRole('tab', { name: /Comments/ });
    await page.getByRole('tab', { name: 'Contributors' }).click();
    await options(page).getByRole('button', { name: 'Reveal the comments pane' }).click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    // The host's onShown takes the shown pane in place of moving focus into it.
    await expect(hostLog(page)).toContainText('Pane shown');
  });

  test('DOCE-COLLAB-1.3 DOCE-COLLAB-3.4 opens the host person cards for avatars and contributors', async ({
    lab,
    page,
  }) => {
    await lab.open('comments');
    await options(page).getByLabel('Collaborators').check();
    await options(page).getByLabel('Host person cards').check();
    await page
      .getByRole('group', { name: 'People in this document' })
      .getByRole('button')
      .filter({ hasText: 'GH' })
      .hover();
    const hostCard = page.getByText('Grace Hopper · Host card');
    await expect(hostCard).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(hostCard).toHaveCount(0);
    await options(page).getByLabel('Side panel').check();
    // The collapsed panel's launcher shows the pane.
    await page.getByRole('button', { name: 'Contributors' }).click();
    // Grace wrote the suggestion, so she is a contributor.
    await page.getByRole('tabpanel').getByText('Grace Hopper').hover();
    await expect(hostCard).toBeVisible();
  });

  test('DOCE-EDITOR-3.9 hands the host a link address from the menu and the key', async ({
    lab,
    page,
  }) => {
    await lab.open('comments');
    await options(page).getByLabel('Copy link in the menu').check();
    await content(page).getByText('Reports go to the operator console').click({ button: 'right' });
    await page.getByRole('menuitem', { name: /^Copy link/ }).click();
    await expect(hostLog(page)).toContainText(/Link to \S+/);
    await content(page).getByText('Reports go to the operator console').click();
    await page.keyboard.press('ControlOrMeta+Shift+k');
    await expect(hostLog(page).locator('xpath=.')).toContainText(/Link to \S+[\s\S]*Link to \S+/);
  });
});
