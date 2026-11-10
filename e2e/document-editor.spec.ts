import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const editor = (page: Page) => page.locator('.de-document-editor');
const pages = (page: Page) => page.locator('.de-document-editor__content .pm-page');
const heading = (page: Page, text: string) =>
  page.locator('.de-document-editor__content h1', { hasText: text });
const content = (page: Page) => page.locator('.de-document-editor__content');
const menu = (page: Page) => page.getByRole('menu', { name: 'Document actions' });
const item = (page: Page, name: string | RegExp) =>
  page.getByRole('menu').last().getByRole('menuitem', { name });

// The rows of the lab's first table, as their cells' text.
const firstTable = (page: Page) =>
  content(page)
    .locator('table')
    .first()
    .evaluate((table) =>
      Array.from((table as HTMLTableElement).rows).map((row) =>
        Array.from(row.cells)
          .map((each) => each.textContent)
          .join('|'),
      ),
    );

// The point in the document just inside the first occurrence of a text, scrolled into view.
async function pointAt(page: Page, value: string) {
  const point = await content(page).evaluate((element, text) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.textContent?.indexOf(text) ?? -1;
      if (at < 0) continue;
      node.parentElement?.scrollIntoView({ block: 'center' });
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + text.length);
      const rect = range.getBoundingClientRect();
      return { left: rect.left, right: rect.right, y: rect.top + rect.height / 2 };
    }
    return null;
  }, value);
  if (!point) throw new Error(`No text ${value}`);
  return point;
}

// Selects a text in the document by dragging across it.
async function selectText(page: Page, value: string) {
  const point = await pointAt(page, value);
  await page.mouse.move(point.left + 1, point.y);
  await page.mouse.down();
  await page.mouse.move(point.right - 1, point.y, { steps: 4 });
  await page.mouse.up();
}

// Opens the context menu with a secondary click inside a text.
async function openMenuAt(page: Page, value: string) {
  const point = await pointAt(page, value);
  await page.mouse.click(point.left + 2, point.y, { button: 'right' });
  await expect(menu(page)).toBeVisible();
}

test.describe('document editor lab', () => {
  test('DOCE-EDITOR-2.1 edits the document on pages that follow the edits', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    await expect.poll(() => pages(page).count()).toBeGreaterThan(1);
    await heading(page, 'Timing').click();
    await page.keyboard.press('End');
    await page.keyboard.type(' and order');
    await expect(heading(page, 'Timing and order')).toHaveCount(1);
    await expect(
      page.locator('.de-document-editor__content .de-contents__entry', {
        hasText: 'Timing and order',
      }),
    ).toHaveCount(1);
  });

  test('DOCE-EDITOR-2.2 joins the pages in the web layout and lays them out again', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    const count = await pages(page).count();
    expect(count).toBeGreaterThan(1);
    await page.getByLabel('Web layout').check();
    await expect(editor(page)).toHaveAttribute('data-layout', 'web');
    await expect(pages(page)).toHaveCount(1);
    await expect(page.locator('.de-document-editor__measure')).toHaveCount(0);
    await page.getByLabel('Pages').check();
    await expect(editor(page)).toHaveAttribute('data-layout', 'page');
    await expect(pages(page)).toHaveCount(count);
  });

  test('DOCE-EDITOR-2.3 reads the document without taking edits, keeping its text', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    const content = page.getByRole('textbox', { name: 'Sample document' });
    await heading(page, 'Power').click();
    await page.getByLabel('Authoring').uncheck();
    await expect(editor(page)).toHaveAttribute('data-mode', 'reading');
    await expect(content).toHaveAttribute('contenteditable', 'false');
    await heading(page, 'Power').click();
    await page.keyboard.type('Ignored');
    await expect(page.getByText('Ignored')).toHaveCount(0);
    await page.getByLabel('Authoring').check();
    await expect(editor(page)).toHaveAttribute('data-mode', 'authoring');
    await expect(content).toHaveAttribute('contenteditable', 'true');
    await expect(heading(page, 'Power')).toHaveCount(1);
  });

  test('DOCE-EDITOR-3.1 opens the context menu at the pointer and at the caret', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    await selectText(page, 'Scope conditions');
    await openMenuAt(page, 'Scope conditions');
    // Inside the selection, the menu keeps it.
    await expect(item(page, /^Copy/)).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(menu(page)).toHaveCount(0);
    // Elsewhere, it moves the caret there first.
    await openMenuAt(page, 'Normal operation');
    await expect(item(page, /^Copy/)).toBeDisabled();
    await page.keyboard.press('Escape');
    await heading(page, 'Timing').click();
    await page.keyboard.press('Shift+F10');
    await expect(menu(page)).toBeVisible();
    await expect(item(page, /^Paste as plain text/)).toBeEnabled();
  });

  test('DOCE-EDITOR-3.2 cuts and pastes as plain text from the menu', async ({
    lab,
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await lab.open('document-editor');
    await selectText(page, 'Degraded');
    await openMenuAt(page, 'Degraded');
    await item(page, /^Cut/).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('Degraded');
    const items = content(page).locator('ul').first().locator('li');
    await expect(items.nth(1)).toHaveText(' operation');
    await openMenuAt(page, 'Maintenance');
    await item(page, /^Paste as plain text/).click();
    await expect(items.nth(2)).toContainText('Degraded');
  });

  test('DOCE-EDITOR-3.3 decides a suggestion and starts a comment from the menu', async ({
    lab,
    page,
  }) => {
    await lab.open('comments');
    await openMenuAt(page, 'every');
    await item(page, 'Accept suggestion').click();
    await expect(content(page)).toContainText('The log keeps each report');
    await selectText(page, 'operator console');
    await openMenuAt(page, 'operator console');
    await item(page, 'Comment').click();
    await expect(
      content(page).locator('mark[data-comment-id]', { hasText: 'operator console' }),
    ).toHaveCount(1);
  });

  test('DOCE-EDITOR-3.4 adds a paragraph before a table from the menu', async ({ lab, page }) => {
    await lab.open('document-editor');
    await openMenuAt(page, 'Start');
    await item(page, 'Add paragraph before').click();
    await page.keyboard.type('Before the limits');
    const block = content(page).locator('p', { hasText: 'Before the limits' });
    await expect(block).toHaveCount(1);
    await expect(block.locator('xpath=following-sibling::*[1]')).toHaveJSProperty(
      'tagName',
      'TABLE',
    );
  });

  test('DOCE-EDITOR-3.5 inserts and deletes table rows from the Table submenu', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    await openMenuAt(page, 'Start');
    await item(page, 'Table').hover();
    await item(page, 'Insert').hover();
    await item(page, 'Row below').click();
    await expect.poll(() => firstTable(page)).toEqual(['Condition|Limit', 'Start|25 ms', '|']);
    await openMenuAt(page, 'Start');
    await item(page, 'Table').hover();
    await expect(item(page, 'Merge cells')).toBeDisabled();
    await item(page, 'Delete').hover();
    await item(page, 'Delete row').click();
    await expect.poll(() => firstTable(page)).toEqual(['Condition|Limit', '|', 'Run|50 ms']);
  });

  test('DOCE-EDITOR-4.1 formats, styles and inserts from the toolbar', async ({ lab, page }) => {
    await lab.open('document-editor');
    const toolbar = page.getByRole('toolbar', { name: 'Formatting' });
    await heading(page, 'Timing').click();
    await expect(toolbar.getByRole('button', { name: /Text style/ })).toContainText('Heading 1');
    await selectText(page, 'Normal operation');
    const bold = toolbar.getByRole('button', { name: 'Bold' });
    await expect(bold).toHaveAttribute('aria-pressed', 'false');
    await bold.click();
    await expect(bold).toHaveAttribute('aria-pressed', 'true');
    await expect(content(page).locator('strong', { hasText: 'Normal operation' })).toHaveCount(1);
    await expect(content(page)).toBeFocused();
    // Each text style shows in its own style, but at the list's size.
    await toolbar.getByRole('button', { name: /Text style/ }).click();
    const preview = (style: string) =>
      page.locator(`.de-document-editor__style-preview[data-block-style="${style}"]`);
    const look = (style: string) =>
      preview(style).evaluate((element) => {
        const { fontWeight, fontSize } = getComputedStyle(element);
        return { fontWeight, fontSize };
      });
    const [paragraph, title] = [await look('paragraph'), await look('heading-1')];
    expect(title.fontWeight).toBe('700');
    expect(paragraph.fontWeight).toBe('400');
    expect(title.fontSize).toBe(paragraph.fontSize);
    await page.keyboard.press('Escape');
    const tables = await content(page).locator('table').count();
    await toolbar.getByRole('button', { name: 'Insert table' }).click();
    await page.getByRole('grid', { name: 'Insert table' }).press('Enter');
    await expect.poll(() => content(page).locator('table').count()).toBeGreaterThan(tables);
    await page.getByLabel('Authoring').uncheck();
    await expect(bold).toBeDisabled();
  });

  test('DOCE-EDITOR-4.2 scrolls the document in its frame below the toolbar', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    await expect(editor(page)).toHaveAttribute('data-scrollable', 'true');
    // The editor takes the window's height left, so only the editor scrolls.
    const pageScrolls = () =>
      page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight);
    expect(await pageScrolls()).toBe(false);
    const bottom = await editor(page).evaluate((element) => element.getBoundingClientRect().bottom);
    expect(bottom).toBeGreaterThan((page.viewportSize()?.height ?? 0) - 40);
    const viewport = page.locator('.de-document-editor__viewport .ui-scroll-region__viewport');
    const toolbar = page.locator('.de-document-editor__toolbar');
    await viewport.hover();
    const before = await toolbar.boundingBox();
    await page.mouse.wheel(0, 1200);
    await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect(await toolbar.boundingBox()).toEqual(before);
    await page.getByLabel('Scrolling frame').uncheck();
    await expect(editor(page)).not.toHaveAttribute('data-scrollable');
    await expect(page.locator('.de-document-editor__viewport')).toHaveCount(0);
  });

  test('DOCE-EDITOR-5.1 reports the page of the caret, the words and the mode in the status bar', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    const status = page.getByRole('group', { name: 'Document status' });
    const position = status.locator('.de-document-editor__status-item[data-status="position"]');
    const total = await pages(page).count();
    await expect(position).toContainText(`Page 1 of ${String(total)}`);
    const words = Number(
      /([\d,]+) words/.exec((await position.textContent()) ?? '')?.[1]?.replace(',', ''),
    );
    expect(words).toBeGreaterThan(100);
    await heading(page, 'Power').click();
    await expect(position).not.toContainText('Page 1 of');
    await selectText(page, 'Normal operation');
    await expect(position).toContainText(/2 of [\d,]+ words/);
    await expect(status.locator('[data-status="mode"]')).toHaveText('Editing');
    await page.getByLabel('Authoring').uncheck();
    await expect(status.locator('[data-status="mode"]')).toHaveText('Reading');
    await page.getByLabel('Status bar').uncheck();
    await expect(status).toHaveCount(0);
  });
});
