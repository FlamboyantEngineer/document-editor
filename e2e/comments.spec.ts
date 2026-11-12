import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const content = (page: Page) => page.locator('.de-document-editor__content');
const margin = (page: Page) => page.getByRole('list', { name: 'Comments' });
// A card of the margin, not one of the comments listed inside it.
const card = (page: Page, text: string) =>
  margin(page).locator(':scope > [role="listitem"]').filter({ hasText: text });

// Selects a text in the document and waits until the editor's selection covers it.
async function selectText(page: Page, value: string) {
  const before = await page.evaluate(() => document.documentElement.dataset.labCaret ?? '');
  const box = await content(page).evaluate((element, text) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.textContent?.indexOf(text) ?? -1;
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + text.length);
      const rect = range.getBoundingClientRect();
      return { left: rect.left, right: rect.right, y: rect.top + rect.height / 2 };
    }
    return null;
  }, value);
  if (!box) throw new Error(`No text ${value}`);
  await page.mouse.move(box.left + 1, box.y);
  await page.mouse.down();
  await page.mouse.move(box.right - 1, box.y, { steps: 4 });
  await page.mouse.up();
  await page.waitForFunction(
    (previous) => (document.documentElement.dataset.labCaret ?? '') !== previous,
    before,
  );
}

async function top(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('The element should be laid out.');
  return box.y;
}

test.describe('comments lab', () => {
  test('DOCE-COMMENTS-3.1 shows each card beside its text', async ({ lab, page }) => {
    await lab.open('comments');
    const thread = card(page, 'Is one second measured');
    await expect(thread).toBeVisible();
    const anchor = content(page).locator('mark[data-comment-id]');
    await expect
      .poll(async () => Math.abs((await top(thread)) - (await top(anchor))))
      .toBeLessThan(16);
    await expect(card(page, 'Grace Hopper')).toHaveCount(2);
    await expect(card(page, 'every')).toContainText('Accept');
  });

  test('DOCE-COMMENTS-3.2 starts, answers and resolves a thread', async ({ lab, page }) => {
    await lab.open('comments');
    await selectText(page, 'operator console');
    await margin(page).getByRole('button', { name: 'Comment' }).click();
    await expect(margin(page).getByRole('textbox', { name: 'Add a comment' })).toBeFocused();
    await page.keyboard.type('Which console?');
    await margin(page).getByRole('button', { name: 'Comment' }).click();
    const thread = card(page, 'Which console?');
    await expect(thread).toContainText('Ada Lovelace');
    await expect(
      content(page).locator('mark[data-comment-id]', { hasText: 'operator console' }),
    ).toHaveCount(1);
    await thread.getByRole('textbox', { name: 'Reply' }).fill('The main one.');
    await thread.getByRole('button', { name: 'Reply' }).click();
    await expect(thread).toContainText('The main one.');
    await thread.getByRole('button', { name: 'Resolve' }).click();
    await expect(card(page, 'Which console?')).toHaveCount(0);
    await expect(
      content(page).locator('mark[data-comment-state="resolved"]', { hasText: 'operator console' }),
    ).toHaveCount(1);
  });

  test('DOCE-COMMENTS-3.3 discusses and accepts a suggestion', async ({ lab, page }) => {
    await lab.open('comments');
    const suggestion = card(page, 'every');
    await suggestion.getByText('Grace Hopper').click();
    await suggestion.getByRole('textbox', { name: 'Add a comment' }).fill('Agreed.');
    await suggestion.getByRole('button', { name: 'Comment' }).click();
    await expect(suggestion).toContainText('Agreed.');
    await expect(content(page).locator('ins[data-comment-id]')).toHaveText('each');
    await suggestion.getByRole('button', { name: 'Accept' }).click();
    await expect(content(page)).toContainText('The log keeps each report');
    await expect(card(page, 'Agreed.')).toHaveCount(0);
  });

  test('DOCE-COMMENTS-3.4 shows threads read-only while reading', async ({ lab, page }) => {
    await lab.open('comments');
    await page.getByLabel('Reading only').check();
    await expect(card(page, 'Is one second measured')).toBeVisible();
    await expect(margin(page).getByRole('textbox')).toHaveCount(0);
    await expect(margin(page).getByRole('button', { name: /Accept|Resolve/ })).toHaveCount(0);
  });

  test('DOCE-COMMENTS-2.6 starts a thread on the caret paragraph with Mod-Alt-M, drawn until stored', async ({
    lab,
    page,
  }) => {
    await lab.open('comments');
    await content(page).getByText('Reports go to the operator console').click();
    await page.keyboard.press('ControlOrMeta+Alt+m');
    const draft = content(page).locator('mark[data-comment-draft]');
    await expect(draft).toHaveText('Reports go to the operator console and to the log.');
    await expect(margin(page).getByRole('textbox', { name: 'Add a comment' })).toBeFocused();
    await page.keyboard.type('Which log?');
    await margin(page).getByRole('button', { name: 'Comment' }).click();
    await expect(draft).toHaveCount(0);
    await expect(
      content(page).locator('mark[data-comment-id]', { hasText: 'and to the log.' }),
    ).toHaveCount(1);
    await expect(card(page, 'Which log?')).toContainText('Ada Lovelace');
  });

  test('DOCE-COMMENTS-2.7 edits the reader own comment and reacts to another', async ({
    lab,
    page,
  }) => {
    await lab.open('comments');
    const first = card(page, 'Is one second measured');
    await first.getByRole('button', { name: /👍/ }).click();
    await expect(first.getByRole('button', { name: /👍/ })).toHaveAttribute('aria-pressed', 'true');
    await selectText(page, 'operator console');
    await margin(page).getByRole('button', { name: 'Comment' }).click();
    await expect(margin(page).getByRole('textbox', { name: 'Add a comment' })).toBeFocused();
    await page.keyboard.type('Which console?');
    await margin(page).getByRole('button', { name: 'Comment' }).click();
    // The card by the text it quotes, which the edit leaves.
    const thread = card(page, 'operator console');
    await expect(thread).toContainText('Which console?');
    await thread
      .getByRole('button', { name: /actions|More/i })
      .first()
      .click();
    await page.getByRole('menuitem', { name: 'Edit' }).click();
    await thread.getByRole('textbox', { name: 'Edit comment' }).fill('Which consoles?');
    await thread.getByRole('button', { name: 'Save' }).click();
    await expect(thread).toContainText('Which consoles?');
  });

  test('DOCE-COMMENTS-2.8 shows resolved threads and reopens one', async ({ lab, page }) => {
    await lab.open('comments');
    await card(page, 'Is one second measured').getByRole('button', { name: 'Resolve' }).click();
    await expect(card(page, 'Is one second measured')).toHaveCount(0);
    await page.getByLabel('Resolved threads').check();
    const thread = card(page, 'Is one second measured');
    await thread.getByRole('button', { name: 'Reopen' }).click();
    await page.getByLabel('Resolved threads').uncheck();
    await expect(card(page, 'Is one second measured')).toHaveCount(1);
    await expect(
      content(page).locator('mark[data-comment-state="open"]', { hasText: 'one second' }),
    ).toHaveCount(1);
  });

  test('DOCE-COMMENTS-2.9 opens a thread from the handle', async ({ lab, page }) => {
    await lab.open('comments');
    const before = await page.evaluate(() => document.documentElement.dataset.labCaret ?? '');
    await page.getByRole('button', { name: 'Open the first thread' }).click();
    await page.waitForFunction(
      (previous) => (document.documentElement.dataset.labCaret ?? '') !== previous,
      before,
    );
    await expect(page.getByRole('textbox', { name: 'Sample document' })).toBeFocused();
    await expect(card(page, 'Is one second measured')).toHaveAttribute('data-active', 'true');
  });

  test('DOCE-COMMENTS-2.11 lists every thread in the panel, filtered, and goes to one', async ({
    lab,
    page,
  }) => {
    await lab.open('comments');
    await page.getByLabel('Comments panel').check();
    const panel = page.getByRole('region', { name: 'All comments' });
    await expect(panel).toContainText('Is one second measured');
    await panel.getByRole('radio', { name: 'Mine' }).click();
    await expect(panel).toContainText('No comments.');
    await panel.getByRole('radio', { name: 'Open' }).click();
    const before = await page.evaluate(() => document.documentElement.dataset.labCaret ?? '');
    await panel.getByRole('button', { name: 'Show in document' }).first().click();
    await page.waitForFunction(
      (previous) => (document.documentElement.dataset.labCaret ?? '') !== previous,
      before,
    );
    await expect(page.getByRole('textbox', { name: 'Sample document' })).toBeFocused();
  });

  test('DOCE-COMMENTS-2.12 keeps a reply being written when its composer goes and comes back', async ({
    lab,
    page,
  }) => {
    await lab.open('comments');
    const thread = card(page, 'Is one second measured');
    await thread.getByRole('textbox', { name: 'Reply' }).fill('From the detection.');
    await page.getByLabel('Reading only').check();
    await expect(thread.getByRole('textbox', { name: 'Reply' })).toHaveCount(0);
    await page.getByLabel('Reading only').uncheck();
    await expect(thread.getByRole('textbox', { name: 'Reply' })).toHaveText('From the detection.');
  });

  test('DOCE-COMMENTS-2.13 mentions a person the host finds, shown as their chip', async ({
    lab,
    page,
  }) => {
    await lab.open('comments');
    const thread = card(page, 'Is one second measured');
    await thread.getByRole('textbox', { name: 'Reply' }).click();
    await page.keyboard.type('Over to @Gra');
    await page.getByRole('option', { name: /Grace Hopper/ }).click();
    await thread.getByRole('button', { name: 'Reply' }).click();
    await expect(thread.getByRole('article').last()).toContainText('Over to');
    await expect(thread.getByRole('article').last()).toContainText('Grace Hopper');
    await expect(thread.getByRole('article').last()).not.toContainText('@[');
  });

  test('DOCE-COMMENTS-4.1 decides a suggestion from the panel', async ({ lab, page }) => {
    await lab.open('comments');
    await page.getByLabel('Comments panel').check();
    const panel = page.getByRole('region', { name: 'All comments' });
    const suggestion = panel.locator('.de-comments-panel__suggestion');
    await expect(suggestion).toContainText('Grace Hopper');
    await expect(panel.getByRole('radio', { name: /All/ })).toContainText('2');
    await suggestion.getByRole('button', { name: 'Accept' }).click();
    await expect(content(page)).toContainText('The log keeps each report');
    await expect(suggestion).toHaveCount(0);
  });

  test('DOCE-COMMENTS-4.3 DOCE-COMMENTS-4.4 reads Markdown and opens a mention’s card', async ({
    lab,
    page,
  }) => {
    await lab.open('comments');
    await page.getByLabel('Markdown comments').check();
    const thread = card(page, 'Is one second measured');
    await thread.getByRole('textbox', { name: 'Reply' }).click();
    await page.keyboard.type('**Ask** @Gra');
    await page.getByRole('option', { name: /Grace Hopper/ }).click();
    await thread.getByRole('button', { name: 'Reply' }).click();
    const reply = thread.getByRole('article').last();
    await expect(reply.locator('strong')).toHaveText('Ask');
    await reply.getByRole('button', { name: 'Grace Hopper' }).click();
    await expect(page.getByRole('dialog', { name: 'Grace Hopper' })).toBeVisible();
  });

  test('DOCE-COMMENTS-4.2 filters the margin to the reader’s own threads', async ({
    lab,
    page,
  }) => {
    await lab.open('comments');
    await expect(card(page, 'Is one second measured')).toHaveCount(1);
    await page.getByLabel('Mine only').check();
    await expect(card(page, 'Is one second measured')).toHaveCount(0);
    await page.getByLabel('Mine only').uncheck();
    await page.getByLabel('Threads I wrote in only').check();
    await expect(card(page, 'Is one second measured')).toHaveCount(0);
  });
});
