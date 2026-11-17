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
    await expect(card(page, 'every').getByRole('button', { name: 'Accept' })).toBeVisible();
  });

  test('DOCE-COMMENTS-2.23 opens a card only on request with markers', async ({ lab, page }) => {
    await lab.open('comments');
    await page.getByLabel('Markers, cards on request').check();
    await expect(margin(page).getByText('Is one second measured')).toHaveCount(0);
    // A click on the thread's text opens its card, focused, and a second one its reply box.
    const anchor = content(page).locator('mark[data-comment-id]').first();
    await anchor.click();
    const thread = margin(page).getByRole('group', { name: 'Comment thread' }).first();
    await expect(thread).toContainText('Is one second measured');
    await expect(page.locator('.de-document-comments__card').first()).toBeFocused();
    await anchor.click();
    await expect(thread.getByRole('textbox', { name: 'Reply' })).toBeFocused();
  });

  test('DOCE-COMMENTS-2.24 puts a thread being started away on a click in the page', async ({
    lab,
    page,
  }) => {
    await lab.open('comments');
    await selectText(page, 'operator console');
    await margin(page).getByRole('button', { name: 'Comment' }).click();
    const composer = margin(page).getByRole('textbox', { name: 'Add a comment' });
    await expect(composer).toBeFocused();
    await content(page).getByText('operator console').click({ button: 'right' });
    await page.keyboard.press('Escape');
    await expect(composer).toBeVisible();
    await content(page).getByText('operator console').click();
    await expect(composer).toHaveCount(0);
    await expect(content(page).locator('mark[data-comment-draft]')).toHaveCount(0);
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
    await suggestion.getByRole('textbox', { name: 'Reply' }).fill('Agreed.');
    await suggestion.getByRole('button', { name: 'Reply' }).click();
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
    await thread.getByRole('button', { name: 'More actions' }).click();
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
    await thread.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Reopen' }).click();
    await expect(thread.getByRole('button', { name: 'Resolve' })).toBeVisible();
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

  test('DOCE-COMMENTS-3.6 draws the anchor holding the caret as active', async ({ lab, page }) => {
    await lab.open('comments');
    const active = content(page).locator('[data-comment-active="true"]');
    await expect(active).toHaveCount(0);
    await page.getByRole('button', { name: 'Open the first thread' }).click();
    await expect(active).toHaveText('one second');
    await selectText(page, 'detecting');
    await expect(active).toHaveCount(0);
  });

  test('DOCE-COMMENTS-2.11 lists every thread in the panel, filtered, and goes to one', async ({
    lab,
    page,
  }) => {
    await lab.open('comments');
    await page.getByLabel('Full cards in the panel').check();
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

  test('DOCE-COMMENTS-4.13 lists the threads beside the text as rows that open their cards', async ({
    lab,
    page,
  }) => {
    await lab.open('comments');
    await page.getByLabel('Markers, cards on request').check();
    await page.getByLabel('Comments panel').check();
    const rows = page
      .getByRole('region', { name: 'All comments' })
      .getByRole('list', { name: 'In the document' });
    const row = rows.getByRole('button', { name: /Comment by/ }).first();
    await expect(row).toContainText('on “');
    const before = await page.evaluate(() => document.documentElement.dataset.labCaret ?? '');
    await row.click();
    await page.waitForFunction(
      (previous) => (document.documentElement.dataset.labCaret ?? '') !== previous,
      before,
    );
    const opened = margin(page).locator('.de-document-comments__card:focus');
    await expect(opened).toContainText('Is one second measured');
    await expect(opened).toBeInViewport();
  });

  test('DOCE-COMMENTS-2.12 keeps a reply being written when its composer goes and comes back', async ({
    lab,
    page,
  }) => {
    await lab.open('comments');
    const thread = card(page, 'Is one second measured');
    // The reply box shows on the selected card.
    await thread.getByText('Is one second measured').click();
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
    await thread.getByText('Is one second measured').click();
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
    await page.getByLabel('Full cards in the panel').check();
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
    await thread.getByText('Is one second measured').click();
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

  test('DOCE-COMMENTS-2.6 starts one thread across paragraphs with Mod-Alt-M', async ({
    lab,
    page,
  }) => {
    await lab.open('comments');
    await selectText(page, 'operator console');
    // The selection reaches into the next paragraph once the editor has taken the key.
    const caret = () => page.evaluate(() => document.documentElement.dataset.labCaret ?? '');
    const before = await caret();
    await expect(async () => {
      if ((await caret()) === before) await page.keyboard.press('Shift+ArrowDown');
      expect(await caret()).not.toBe(before);
    }).toPass({ intervals: [200, 400, 800] });
    await page.keyboard.press('ControlOrMeta+Alt+m');
    await page.keyboard.type('Across');
    await margin(page).getByRole('button', { name: 'Comment', exact: true }).click();
    await expect(card(page, 'Across')).toHaveCount(1);
    const thread = await content(page)
      .locator('mark[data-comment-id]', { hasText: 'operator console' })
      .last()
      .getAttribute('data-comment-id');
    // The one thread's marks lie in two paragraphs.
    const marks = content(page).locator(`mark[data-comment-id="${thread ?? ''}"]`);
    await expect
      .poll(() =>
        marks.evaluateAll(
          (found) => new Set(found.map((mark) => mark.closest('p, li, h1, h2, h3'))).size,
        ),
      )
      .toBeGreaterThanOrEqual(2);
  });

  test('DOCE-COMMENTS-4.7 keeps the threads in the pane and starts one there with Mod-Alt-M', async ({
    lab,
    page,
  }) => {
    await lab.open('comments');
    await page.getByLabel('Comments in the pane only').check();
    const panel = page.getByRole('region', { name: 'All comments' });
    await expect(panel).toContainText('Is one second measured');
    await expect(margin(page)).toHaveCount(0);
    await selectText(page, 'operator console');
    await page.keyboard.press('ControlOrMeta+Alt+m');
    const composer = panel.getByRole('textbox').last();
    await expect(composer).toBeFocused();
    await page.keyboard.type('Which one?');
    await panel.getByRole('button', { name: 'Comment', exact: true }).click();
    await expect(panel).toContainText('Which one?');
  });

  test('DOCE-COMMENTS-4.8 DOCE-COMMENTS-4.9 opens a thread at a comment with a reply started', async ({
    lab,
    page,
  }) => {
    await lab.open('comments');
    await page.getByLabel('Full cards in the panel').check();
    await page.getByRole('button', { name: 'Answer the first comment' }).click();
    const panel = page.getByRole('region', { name: 'All comments' });
    const thread = card(page, 'Is one second measured');
    await expect(thread).toHaveAttribute('data-active', 'true');
    await expect(panel.locator('[data-highlighted="true"]')).toContainText(
      'Is one second measured',
    );
    await expect(thread.getByRole('textbox', { name: 'Reply' })).toHaveText('From the detection.');
  });

  test('DOCE-COMMENTS-4.10 DOCE-COMMENTS-4.11 mentions a group and copies a link from a comment’s menu', async ({
    lab,
    page,
  }) => {
    await lab.open('comments');
    await page.getByLabel('Groups and assistants in mentions').check();
    await page.getByLabel('Copy-link action').check();
    const thread = card(page, 'Is one second measured');
    await thread.getByText('Is one second measured').click();
    await thread.getByRole('textbox', { name: 'Reply' }).click();
    await page.keyboard.type('Over to @Rev');
    await page.getByRole('option', { name: /Reviewers/ }).click();
    await thread.getByRole('button', { name: 'Reply' }).click();
    const reply = thread.getByRole('article').last();
    await expect(reply).toContainText('Reviewers');
    await expect(reply).not.toContainText('@group[');
    // The opening comment's menu is the thread's header menu.
    await thread.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Copy link to thread' }).click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.labCopied))
      .toBe('c0ffee01/e1');
  });
  test('DOCE-COMMENTS-2.22 keeps the reader to the host thread permissions', async ({
    lab,
    page,
  }) => {
    await lab.open('comments');
    const thread = card(page, 'Is one second measured');
    await thread.getByText('Grace Hopper').first().click();
    await expect(thread.getByRole('button', { name: 'Resolve' })).toBeVisible();
    await page.getByLabel('Threads by others read only').check();
    await thread.getByText('Grace Hopper').first().click();
    await expect(thread.getByRole('button', { name: 'Resolve' })).toHaveCount(0);
    await expect(thread.getByRole('textbox', { name: 'Reply' })).toHaveCount(0);
  });

  test('DOCE-COMMENTS-2.10 offers only the decisions the host allows', async ({ lab, page }) => {
    await lab.open('comments');
    const suggestion = card(page, 'every');
    await expect(suggestion.getByRole('button', { name: 'Reject' })).toBeVisible();
    await page.getByLabel('Reject only my own suggestions').check();
    await expect(suggestion.getByRole('button', { name: 'Reject' })).toHaveCount(0);
    await expect(suggestion.getByRole('button', { name: 'Accept' })).toBeVisible();
  });

  test('DOCE-COMMENTS-2.21 starts a thread for the reader’s suggestion once they pause', async ({
    lab,
    page,
  }) => {
    await lab.open('comments');
    await page.getByLabel('Suggesting').check();
    await page.getByLabel('A thread for each suggestion').check();
    await content(page).getByText('The log keeps').click();
    await page.keyboard.press('End');
    await page.keyboard.type(' Twice');
    await expect(card(page, 'Twice')).toBeVisible();
  });

  test('DOCE-COMMENTS-2.11 tells the host the panel filter the reader picks', async ({
    lab,
    page,
  }) => {
    await lab.open('comments');
    await page.getByLabel('Comments panel').check();
    const panel = page.getByRole('region', { name: 'All comments' });
    await panel.getByRole('radio', { name: /All/ }).check();
    await expect(page.getByRole('status', { name: 'Panel filter' })).toHaveText('all');
  });
});
