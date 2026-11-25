import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const status = (page: Page, name: string) => page.getByLabel(`${name}'s status`);
const editor = (page: Page, name: string) =>
  page.getByRole('textbox', { name: `${name}'s document` });
// A reader's connection item in their editor's status bar (DOCE-SESSION-9.7).
const connectionItem = (page: Page, name: string) =>
  page
    .getByRole('region', { name })
    .locator('.de-document-editor__status-item[data-status="connection"]');
const SENTENCE = 'The system shall report each fault within one second.';
// A reader's paragraph, compared whole so a change sent twice shows (DOCE-COLLAB-4.1).
const paragraph = (page: Page, name: string) =>
  editor(page, name).locator('p', { hasText: 'report each fault' });

// A reader's paragraph text without the other people's caret labels (DOCE-SESSION-3.9).
const textOf = (page: Page, name: string) =>
  paragraph(page, name).evaluate((element) => {
    const copy = element.cloneNode(true) as HTMLElement;
    for (const caret of copy.querySelectorAll('.de-presence-caret')) caret.remove();
    return copy.textContent;
  });

// Types at the end of a reader's paragraph, placing the caret by clicking past its text once the
// room's threads show beside it, so the page no longer moves.
async function typeAtEnd(page: Page, name: string, value: string) {
  await expect(
    page.getByRole('region', { name, exact: true }).getByRole('list', { name: 'Comments' }),
  ).toContainText('Which operator?');
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
    await expect.poll(() => textOf(page, 'Grace')).toBe(`${SENTENCE} Always.`);
    await expect.poll(() => textOf(page, 'Ada')).toBe(`${SENTENCE} Always.`);
    await expect(status(page, 'Ada')).toHaveText('ready · saved');
  });

  test('DOCE-SESSION-3.3 DOCE-SESSION-3.8 DOCE-SESSION-9.7 keeps an offline reader’s changes until they come back', async ({
    lab,
    page,
  }) => {
    await lab.open('session-room');
    await expect(status(page, 'Ada')).toHaveText(/^ready · /);
    const ada = page.getByRole('region', { name: 'Ada' });
    await ada.getByRole('button', { name: 'Go offline' }).click();
    await expect(status(page, 'Ada')).toHaveText('ready · offline');
    await expect(page.getByLabel("Ada's connection")).toHaveText('offline');
    await expect(connectionItem(page, 'Ada')).toHaveText('Offline');
    await expect(connectionItem(page, 'Grace')).toHaveText('Connected');
    await typeAtEnd(page, 'Ada', ' Later.');
    await expect(editor(page, 'Ada')).toContainText('Later.');
    await expect(editor(page, 'Grace')).not.toContainText('Later.');
    await ada.getByRole('button', { name: 'Go online' }).click();
    await expect(page.getByLabel("Ada's connection")).toHaveText('synced');
    await expect(connectionItem(page, 'Ada')).toHaveText('Connected');
    await expect.poll(() => textOf(page, 'Grace')).toBe(`${SENTENCE} Later.`);
    await expect.poll(() => textOf(page, 'Ada')).toBe(`${SENTENCE} Later.`);
    await expect(status(page, 'Ada')).toHaveText('ready · saved');
  });
});

const reader = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
const roomLog = (page: Page) => page.getByRole('region', { name: 'Room log' });
const margin = (page: Page, name: string) =>
  reader(page, name).getByRole('list', { name: 'Comments' });
const right = (page: Page, name: string, label: string) =>
  reader(page, name).getByRole('checkbox', { name: label, exact: true });
// A reader's editing mode in their status bar.
const modeItem = (page: Page, name: string) =>
  reader(page, name).locator('.de-document-editor__status-item[data-status="mode"]');

test.describe('rooms lab: comments, rights and the write guard', () => {
  test('DOCE-LABS-3.13 DOCE-COMMENTS-2.20 DOCE-COLLAB-6.8 DOCE-COMMENTS-2.32 shows the room’s threads and exports them with their deleted records', async ({
    lab,
    page,
  }) => {
    await lab.open('session-room');
    for (const name of ['Ada', 'Grace']) {
      await expect(margin(page, name)).toContainText('Which operator?');
      await expect(margin(page, name)).toContainText('The one on shift.');
      // A deleted reply and a deleted thread are kept, and shown nowhere.
      await expect(margin(page, name)).not.toContainText('An old note.');
      await expect(margin(page, name)).not.toContainText('A thread Grace deleted.');
    }
    await reader(page, 'Ada').getByRole('button', { name: 'Export the room’s threads' }).click();
    const exported = page.getByRole('list', { name: "Ada's exported threads" });
    await expect(exported).toContainText('c0ffee01: open (3 comments, 1 deleted)');
    await expect(exported).toContainText('c0ffee02: open, by drafting-assistant (1 comments)');
    await expect(exported).toContainText('c0ffee03: deleted, deleted by grace (1 comments)');
  });

  test('DOCE-COMMENTS-2.27 DOCE-COLLAB-6.7 takes an assistant’s thread only from a writer granted the label', async ({
    lab,
    page,
  }) => {
    await lab.open('session-room');
    await right(page, 'Grace', 'label an assistant').check();
    await reader(page, 'Grace')
      .getByRole('button', { name: 'Start a thread as the assistant' })
      .click();
    await reader(page, 'Ada').getByRole('button', { name: 'Export the room’s threads' }).click();
    await expect(page.getByRole('list', { name: "Ada's exported threads" })).toContainText(
      /: open, by drafting-assistant \(1 comments\)[\s\S]*: open, by drafting-assistant/,
    );
    await expect(roomLog(page)).toContainText('Nothing refused yet.');
    // Ada is not granted the label: the guard refuses her thread and cuts her off.
    await reader(page, 'Ada')
      .getByRole('button', { name: 'Start a thread as the assistant' })
      .click();
    await expect(roomLog(page)).toContainText(
      'ada: A connection sent a change its access does not allow.',
    );
    await expect(page.getByLabel("Ada's connection")).toHaveText('refused');
    await expect(page.getByLabel("Grace's connection")).toHaveText('synced');
  });

  test('DOCE-SESSION-1.4 DOCE-HOST-1.16 DOCE-COLLAB-6.6 DOCE-COLLAB-6.7 follows the room’s rights live, and refuses a writer past them', async ({
    lab,
    page,
  }) => {
    await lab.open('session-room');
    await expect(modeItem(page, 'Grace')).toHaveText('Editing');
    for (const label of ['edit', 'suggest', 'decide']) await right(page, 'Grace', label).uncheck();
    await expect(modeItem(page, 'Grace')).toHaveText('Commenting');
    await right(page, 'Grace', 'suggest').check();
    await expect(modeItem(page, 'Grace')).toHaveText('Suggesting');
    // The editor no longer follows the rights: Grace types as an editor, and the guard refuses it.
    await right(page, 'Grace', 'The editor follows the rights').uncheck();
    await expect(modeItem(page, 'Grace')).toHaveText('Editing');
    await typeAtEnd(page, 'Grace', ' Refused.');
    await expect(roomLog(page)).toContainText(
      'grace: A connection sent a change its access does not allow.',
    );
    await expect(page.getByLabel("Grace's connection")).toHaveText('refused');
    await expect.poll(() => textOf(page, 'Ada')).toBe(SENTENCE);
  });

  test('DOCE-COLLAB-7.4 DOCE-SESSION-3.11 reloads a writer whose change does not merge, keeping them connected', async ({
    lab,
    page,
  }) => {
    await lab.open('session-room');
    await page.getByRole('button', { name: 'Delete both list items at once' }).click();
    await expect(roomLog(page)).toContainText(
      'grace: A connection sent a change that does not merge with the room.',
    );
    await expect(roomLog(page)).toContainText(
      "Grace's change was refused for its merge (conflict): the editor reloaded.",
    );
    for (const name of ['Ada', 'Grace']) {
      await expect(editor(page, name).locator('li')).toHaveText(['Raise the alarm']);
      await expect(page.getByLabel(`${name}'s connection`)).toHaveText('synced');
    }
    await typeAtEnd(page, 'Grace', ' Kept.');
    await expect.poll(() => textOf(page, 'Ada')).toBe(`${SENTENCE} Kept.`);
  });

  test('DOCE-COLLAB-7.5 refuses a block sent with another block’s id as a conflict', async ({
    lab,
    page,
  }) => {
    await lab.open('session-room');
    await page.getByRole('button', { name: 'Ada sends a block with another block’s id' }).click();
    await expect(roomLog(page)).toContainText(
      "Ada's change was refused for its merge (conflict): the editor reloaded.",
    );
    for (const name of ['Ada', 'Grace'])
      await expect(editor(page, name).locator('p', { hasText: 'report each fault' })).toHaveCount(
        1,
      );
    await expect(page.getByLabel("Ada's connection")).toHaveText('synced');
  });

  test('DOCE-COLLAB-7.3 repairs the guard after a failed self-check, and the room goes on', async ({
    lab,
    page,
  }) => {
    await lab.open('session-room');
    await page.getByRole('button', { name: 'Break the guard’s next self-check' }).click();
    await typeAtEnd(page, 'Ada', ' Once.');
    await expect(roomLog(page)).toContainText('The guard was repaired from the room (reading).');
    await typeAtEnd(page, 'Ada', ' Twice.');
    await expect.poll(() => textOf(page, 'Grace')).toBe(`${SENTENCE} Once. Twice.`);
  });

  test('DOCE-COLLAB-4.7 locks both editors once the room holds a block they cannot read', async ({
    lab,
    page,
  }) => {
    await lab.open('session-room');
    await page.getByRole('button', { name: 'Write a block the editors cannot read' }).click();
    await expect(status(page, 'Ada')).toHaveText('ready · error · unavailable');
    await expect(status(page, 'Grace')).toHaveText('ready · error · unavailable');
    await expect(modeItem(page, 'Ada')).toHaveText('Reading');
  });

  test('DOCE-COLLAB-1.6 DOCE-HOST-1.20 shows a reader whose page is hidden as away', async ({
    lab,
    page,
  }) => {
    await lab.open('session-room');
    await paragraph(page, 'Ada').click();
    const caret = editor(page, 'Grace').locator('.de-presence-caret[data-presence-peer="ada"]');
    await expect(caret).toBeVisible();
    await expect(caret).not.toHaveAttribute('data-presence-status');
    await reader(page, 'Ada').getByRole('button', { name: 'Hide page' }).click();
    await expect(caret).toHaveAttribute('data-presence-status', 'away');
    await reader(page, 'Ada').getByRole('button', { name: 'Show page' }).click();
    await expect(caret).not.toHaveAttribute('data-presence-status');
  });

  test('DOCE-SUGGESTIONS-2.7 credits an assistant’s accepted words to the writer who accepts them', async ({
    lab,
    page,
  }) => {
    await lab.open('session-room');
    const words = editor(page, 'Grace').locator('ins', { hasText: 'with their time' });
    await words.click();
    await page.keyboard.press('Shift+F10');
    await page
      .getByRole('menu')
      .last()
      .getByRole('menuitem', { name: 'Accept suggestion' })
      .click();
    // Marked as Grace's, and still as generated (the caret Ada sees there splits its text).
    for (const name of ['Grace', 'Ada'])
      await expect(
        editor(page, name).locator('span[data-au="grace"][data-ai="lab-session"]'),
      ).toHaveCount(1);
    await expect(editor(page, 'Grace').locator('ins')).toHaveCount(0);
    await expect(roomLog(page)).toContainText('Nothing refused yet.');
  });

  test('DOCE-COLLAB-7.1 keeps two fields of one room apart', async ({ lab, page }) => {
    await lab.open('session-room');
    const field = (name: string, which: string) =>
      page.getByRole('textbox', { name: `${name}'s ${which}` });
    await field('Ada', 'summary').locator('p').click();
    await page.keyboard.press('End');
    await page.keyboard.type(' Typed.');
    await expect(field('Grace', 'summary')).toContainText('A short summary of the change. Typed.');
    await expect(field('Grace', 'notes')).toHaveText('Notes for the people who review it.');
  });
});
