import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const content = (page: Page) => page.locator('.de-document-editor__content');
const block = (page: Page, text: string) =>
  content(page).locator('.pm-page-content > *', { hasText: text });
const suggestions = (page: Page) => page.getByRole('complementary', { name: 'Suggestions' });

// Clicks a point in the editor and waits until the editor's caret has moved there.
async function clickAt(page: Page, point: { x: number; y: number }) {
  const before = await page.evaluate(() => document.documentElement.dataset.labCaret ?? '');
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction(
    (previous) => (document.documentElement.dataset.labCaret ?? '') !== previous,
    before,
  );
}

// Clicks just after a block's last character, so the caret is at its end.
async function caretAtEnd(page: Page, text: string) {
  const point = await block(page, text).evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let last: Node | null = null;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) last = node;
    const length = last?.textContent?.length ?? 0;
    const range = document.createRange();
    if (last) range.setStart(last, Math.max(0, length - 1));
    if (last) range.setEnd(last, length);
    const rect = range.getBoundingClientRect();
    return { x: rect.right + 2, y: rect.top + rect.height / 2 };
  });
  await clickAt(page, point);
}

// Clicks just before a text in a block, so the caret is there.
async function caretBefore(page: Page, text: string) {
  const point = await block(page, text).evaluate((element, value) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.textContent?.indexOf(value) ?? -1;
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + 1);
      const rect = range.getBoundingClientRect();
      return { x: rect.left + 1, y: rect.top + rect.height / 2 };
    }
    return { x: 0, y: 0 };
  }, text);
  await clickAt(page, point);
}

test.describe('suggestions lab', () => {
  test('DOCE-SUGGESTIONS-3.1 keeps typing and deleting as suggestions by the writer', async ({
    lab,
    page,
  }) => {
    await lab.open('suggestions');
    await caretAtEnd(page, 'within one second');
    await page.keyboard.type(' at most');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await expect(content(page).locator('ins[data-au="Writer"]')).toHaveText(' at mo');
    await page.getByLabel('Reviewer').check();
    await caretAtEnd(page, 'Reports go');
    for (const _ of 'log.') await page.keyboard.press('Backspace');
    await expect(block(page, 'Reports go').locator('del[data-au="Reviewer"]')).toHaveText('log.');
    await expect(block(page, 'Reports go')).toHaveText(
      'Reports go to the operator console and to the log.',
    );
    await expect(suggestions(page).getByRole('listitem')).toHaveCount(3);
  });

  test('DOCE-SUGGESTIONS-3.2 suggests a split paragraph as its two halves', async ({
    lab,
    page,
  }) => {
    await lab.open('suggestions');
    await caretBefore(page, ' and to the log.');
    await page.keyboard.press('Enter');
    const kinds = content(page).locator('[data-suggestion-split-kind]');
    await expect(kinds).toHaveCount(3);
    await expect(kinds.nth(0)).toHaveAttribute('data-suggestion-split-kind', 'deletion');
    await expect(kinds.nth(1)).toHaveText('Reports go to the operator console');
    await expect(kinds.nth(2)).toHaveText(' and to the log.');
    await suggestions(page)
      .getByRole('listitem')
      .filter({ hasText: 'Writer' })
      .getByRole('button', { name: 'Accept', exact: true })
      .click();
    await expect(kinds).toHaveCount(0);
    await expect(block(page, 'and to the log.')).toHaveText(' and to the log.');
  });

  test('DOCE-SUGGESTIONS-3.3 accepts and rejects suggestions from the list', async ({
    lab,
    page,
  }) => {
    await lab.open('suggestions');
    await caretAtEnd(page, 'within one second');
    await page.keyboard.type(' Always.');
    await expect(suggestions(page).getByRole('listitem')).toHaveCount(2);
    await suggestions(page)
      .getByRole('listitem')
      .filter({ hasText: 'Reviewer' })
      .getByRole('button', { name: 'Reject' })
      .click();
    await expect(block(page, 'The log keeps')).toHaveText(
      'The log keeps every report for ninety days.',
    );
    await suggestions(page).getByRole('button', { name: 'Accept all' }).click();
    await expect(suggestions(page).getByText('No suggestions.')).toBeVisible();
    await expect(block(page, 'within one second')).toHaveText(
      'The system shall report each fault within one second of detecting it. Always.',
    );
    await expect(content(page).locator('ins, del')).toHaveCount(0);
  });

  test('DOCE-SUGGESTIONS-3.4 lets a suggesting writer withdraw only their own suggestion', async ({
    lab,
    page,
  }) => {
    await lab.open('suggestions');
    const menuItem = (name: string) =>
      page.getByRole('menu').last().getByRole('menuitem', { name });
    await caretAtEnd(page, 'within one second');
    await page.keyboard.type(' Always.');
    await page.keyboard.press('Shift+F10');
    await expect(menuItem('Reject suggestion')).toBeVisible();
    await expect(menuItem('Accept suggestion')).toHaveCount(0);
    await menuItem('Reject suggestion').click();
    await expect(block(page, 'within one second')).toHaveText(
      'The system shall report each fault within one second of detecting it.',
    );
    const box = await content(page).locator('ins[data-au="Reviewer"]').boundingBox();
    if (!box) throw new Error('No suggestion by the reviewer');
    await clickAt(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    await page.keyboard.press('Shift+F10');
    await expect(menuItem('Cut')).toBeVisible();
    await expect(menuItem('Reject suggestion')).toHaveCount(0);
  });
});
