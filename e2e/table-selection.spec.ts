import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const content = (page: Page) => page.locator('.de-document-editor__content');
const cell = (page: Page, text: string) =>
  content(page).locator('td, th', { hasText: text }).first();
const selected = (page: Page) => content(page).locator('.selectedCell');
const selectedText = (page: Page) => page.evaluate(() => String(window.getSelection()));

// A point in a cell's left padding, halfway down: outside its paragraph, away from its borders.
async function padding(page: Page, text: string) {
  const target = cell(page, text);
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error('The cell is not drawn');
  return { x: box.x + 2, y: box.y + box.height / 2 };
}

// A point at the blank end of a cell's paragraph.
async function paragraphEnd(page: Page, text: string) {
  const box = await cell(page, text).locator('p').boundingBox();
  if (!box) throw new Error('The paragraph is not drawn');
  return { x: box.x + box.width - 4, y: box.y + box.height / 2 };
}

// Inserts a table of three rows and three columns after the lab's first paragraph.
async function insertTable(page: Page) {
  await content(page).locator('p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.press('ControlOrMeta+Alt+t');
  await expect(content(page).locator('table').first().locator('td')).toHaveCount(6);
}

// Waits out the editor's double click time, so the next press starts a new click.
const settle = (page: Page) => page.waitForTimeout(600);

const emptyCells = (page: Page) =>
  content(page).locator('table').first().locator('td').filter({ hasNotText: /./ });

test.describe('selecting in tables', () => {
  test('DOCE-TABLES-3.11 selects a cell from its padding and its table with a double click there', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    const point = await padding(page, 'Run');
    await page.mouse.click(point.x, point.y);
    await expect(selected(page)).toHaveCount(1);
    await expect(cell(page, 'Run')).toHaveClass(/selectedCell/);
    await settle(page);
    await page.mouse.dblclick(point.x, point.y);
    const table = content(page).locator('table').first();
    const first = await table.locator('td, th').count();
    await expect(table.locator('.selectedCell')).toHaveCount(first);
    // A click at the blank end of a paragraph places the caret, and does again in the same table.
    const end = await paragraphEnd(page, 'Run');
    await page.mouse.click(end.x, end.y);
    await expect(selected(page)).toHaveCount(0);
    await page.mouse.click(point.x, point.y);
    await expect(selected(page)).toHaveCount(1);
    await page.mouse.click(end.x, end.y);
    await expect(selected(page)).toHaveCount(0);
  });

  test('DOCE-TABLES-3.11 selects a cell content as text with a double click, and a click puts a caret back', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    const point = await padding(page, 'Stop');
    await page.mouse.click(point.x, point.y);
    await expect(selected(page)).toHaveCount(1);
    await settle(page);
    await cell(page, 'Stop').locator('p').dblclick();
    await expect(selected(page)).toHaveCount(0);
    await expect.poll(() => selectedText(page)).toBe('Stop');
    await cell(page, 'Stop').locator('p').click();
    await expect.poll(() => selectedText(page)).toBe('');
    await expect(cell(page, 'Stop')).toHaveText('Stop');
  });

  test('DOCE-TABLES-3.11 keeps the caret in an empty cell, for a click and a double click', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    await insertTable(page);
    const empty = emptyCells(page).first();
    await empty.click();
    await expect(selected(page)).toHaveCount(0);
    await settle(page);
    await empty.dblclick();
    await expect(selected(page)).toHaveCount(0);
    await page.keyboard.type('Typed');
    await expect(content(page).locator('table').first()).toContainText('Typed');
  });

  test('DOCE-TABLES-1.1 moves with Tab, adds a row in the last cell, and stays put on Shift-Tab in the first', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    await insertTable(page);
    const table = content(page).locator('table').first();
    await table.locator('th').first().click();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.type('First');
    await expect(table.locator('th').first()).toHaveText('First');
    await table.locator('td').last().click();
    await page.keyboard.press('Tab');
    await expect(table.locator('tr')).toHaveCount(4);
    await page.keyboard.type('Added');
    await expect(table.locator('tr').last().locator('td').first()).toHaveText('Added');
  });

  test('DOCE-TABLES-3.13 DOCE-PAGINATION-7.11 keeps the cells selected after aligning them and adding a column from the menu', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    await cell(page, 'Start').scrollIntoViewIfNeeded();
    await cell(page, 'Start').click({ modifiers: ['ControlOrMeta'] });
    await cell(page, 'Run').click({ modifiers: ['ControlOrMeta'] });
    await expect(selected(page)).toHaveCount(2);
    await cell(page, 'Run').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Table' }).click();
    await page.getByRole('menuitem', { name: 'Align cells' }).click();
    await page.getByRole('menuitem', { name: 'Center', exact: true }).click();
    await expect(selected(page)).toHaveCount(2);
    await expect(cell(page, 'Start')).toHaveAttribute('data-text-align', 'center');
    await expect(cell(page, 'Run')).toHaveAttribute('data-text-align', 'center');
    await cell(page, 'Run').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Table' }).click();
    await page.getByRole('menuitem', { name: 'Insert' }).click();
    await page.getByRole('menuitem', { name: /column.*right/i }).click();
    await expect(selected(page)).toHaveCount(2);
    // Typing into a cell the column added puts the text there.
    const added = cell(page, 'Run').locator('xpath=following-sibling::td[1]');
    await added.click();
    await page.keyboard.type('New');
    await expect(added).toHaveText('New');
  });

  test('DOCE-TABLES-3.6 highlights a row border from either side and forgets it on scroll', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    // The first part of the lab's first table holds its header row and Start.
    const header = cell(page, 'Condition');
    await cell(page, 'Start').scrollIntoViewIfNeeded();
    const box = await header.boundingBox();
    if (!box) throw new Error('The cell is not drawn');
    const flagged = page.locator('[data-row-resize]');
    const x = box.x + box.width / 2;
    await page.mouse.move(x, box.y + box.height / 2);
    await page.mouse.move(x, box.y + box.height - 2, { steps: 3 });
    await expect(flagged).toHaveCount(1);
    await expect(header.locator('.de-row-resize-handle')).toHaveCount(1);
    await page.mouse.move(x, box.y + box.height / 2, { steps: 3 });
    await expect(flagged).toHaveCount(0);
    // The top of the cell below is the same border.
    await page.mouse.move(x, box.y + box.height + 3, { steps: 3 });
    await expect(flagged).toHaveCount(1);
    await expect(header.locator('.de-row-resize-handle')).toHaveCount(1);
    await page.mouse.wheel(0, 40);
    await expect(flagged).toHaveCount(0);
  });
});
