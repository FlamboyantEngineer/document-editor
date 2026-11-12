import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const content = (page: Page) => page.locator('.de-document-editor__content');
const matches = (page: Page) => content(page).locator('[data-search-match]');

// Selects a word by double-clicking on it, where its text is drawn.
async function selectWord(page: Page, block: Locator, word: string) {
  await block.scrollIntoViewIfNeeded();
  await expect(async () => {
    const at = await block.evaluate((element, wanted) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const offset = (node as Text).data.indexOf(wanted);
        if (offset < 0) continue;
        const range = document.createRange();
        range.setStart(node, offset);
        range.setEnd(node, offset + wanted.length);
        const rect = range.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      }
      return null;
    }, word);
    expect(at).not.toBeNull();
    await page.mouse.dblclick(at?.x ?? 0, at?.y ?? 0);
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(word);
  }).toPass();
}

test.describe('find and replace', () => {
  test('DOCE-SEARCH-2.1 finds, steps through and replaces from the find bar', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    await content(page).locator('h1', { hasText: 'Timing' }).click();
    await page.keyboard.press('ControlOrMeta+f');
    const find = page
      .getByRole('searchbox', { name: 'Find in document' })
      .or(page.getByRole('textbox', { name: 'Find in document' }));
    await expect(find).toBeFocused();
    await find.fill('Maintenance');
    await expect.poll(() => matches(page).count()).toBeGreaterThan(1);
    const count = await matches(page).count();
    await expect(content(page).locator('[data-search-match="current"]')).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(content(page).locator('[data-search-match="current"]')).toHaveCount(1);
    await page.getByRole('textbox', { name: /Replace/ }).fill('Upkeep');
    await page.getByRole('button', { name: 'Replace all' }).click();
    await expect(matches(page)).toHaveCount(0);
    await expect(content(page).getByText('Upkeep')).toHaveCount(count);
    await find.press('Escape');
    await expect(find).toHaveCount(0);
    await expect(content(page)).toBeFocused();
  });
});

test.describe('find bar and search pane', () => {
  test('DOCE-SEARCH-1.5 DOCE-SEARCH-2.2 DOCE-SEARCH-3.2 keep their own searches and leave focus where the writer is', async ({
    lab,
    page,
  }) => {
    await lab.open('full-editor');
    const pane = page.getByRole('region', { name: 'Navigation' });
    await pane.getByRole('tab', { name: 'Search' }).click();
    const paneBox = pane.getByRole('searchbox').or(pane.getByRole('textbox')).first();
    await paneBox.fill('Maintenance');
    await expect(pane.getByRole('option').first()).toBeVisible();
    const results = await pane.getByRole('option').count();

    // Mod-F from the toolbar opens the find bar and focuses its box.
    await page.getByRole('toolbar').first().getByRole('button').first().focus();
    await page.keyboard.press('ControlOrMeta+f');
    const find = page.getByRole('searchbox', { name: 'Find in document' });
    await expect(find).toBeFocused();
    await find.fill('Power');
    await expect
      .poll(() => content(page).locator('[data-search-match]').count())
      .toBeGreaterThan(0);
    await expect(content(page).locator('[data-search-result]')).toHaveCount(results);
    await expect(paneBox).toHaveValue('Maintenance');

    // Picking a result reveals it without moving the caret or the find bar's current match.
    await content(page).locator('h1', { hasText: 'Timing' }).click();
    await pane.getByRole('option').nth(1).click();
    await expect(content(page).locator('[data-search-result="current"]')).toHaveCount(1);
    await expect(content(page).locator('[data-search-match="current"]')).toHaveCount(1);

    // Typing in the document keeps focus there while both searches follow the change.
    await content(page).locator('h1', { hasText: 'Timing' }).click();
    await page.keyboard.type(' Power');
    await expect(content(page)).toBeFocused();
    await expect(content(page).locator('h1', { hasText: 'Timing Power' })).toHaveCount(1);
    await expect(find).toHaveValue('Power');
    await expect(paneBox).toHaveValue('Maintenance');
  });

  test('DOCE-SEARCH-2.2 seeds the find bar with the selection and opens at the replacement with Mod-H', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    await selectWord(page, content(page).locator('h1', { hasText: 'Timing' }), 'Timing');
    await page.keyboard.press('ControlOrMeta+f');
    const find = page.getByRole('searchbox', { name: 'Find in document' });
    await expect(find).toHaveValue('Timing');
    await expect(find).toBeFocused();
    await content(page).locator('h1', { hasText: 'Timing' }).click();
    await page.keyboard.press('Control+h');
    await expect(page.getByRole('textbox', { name: /Replace/ })).toBeFocused();
  });
});
