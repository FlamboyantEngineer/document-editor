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

// A point at the blank end of a cell's paragraph, inside the cell's content box: a paragraph on the
// engine's lines reaches into the padding.
async function paragraphEnd(page: Page, text: string) {
  const box = await cell(page, text).locator('p').boundingBox();
  const end = await cell(page, text).evaluate((element) => {
    const { right } = element.getBoundingClientRect();
    return right - parseFloat(getComputedStyle(element).paddingRight);
  });
  if (!box) throw new Error('The paragraph is not drawn');
  return { x: end - 4, y: box.y + box.height / 2 };
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

  test('DOCE-TABLES-3.13 DOCE-PAGINATION-7.11 DOCE-PAGINATION-7.22 keeps the cells selected after aligning them and adding a column from the menu', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    await cell(page, 'Start').scrollIntoViewIfNeeded();
    await cell(page, 'Start').click({ modifiers: ['ControlOrMeta'] });
    await cell(page, 'Run').click({ modifiers: ['ControlOrMeta'] });
    await expect(selected(page)).toHaveCount(2);
    await cell(page, 'Run').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Align cells' }).click();
    await page.getByRole('menuitem', { name: 'Center', exact: true }).click();
    await expect(selected(page)).toHaveCount(2);
    await expect(cell(page, 'Start')).toHaveAttribute('data-text-align', 'center');
    await expect(cell(page, 'Run')).toHaveAttribute('data-text-align', 'center');
    await cell(page, 'Run').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Insert column' }).click();
    await page.getByRole('menuitem', { name: 'Column right' }).click();
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

  test('DOCE-TABLES-3.3 DOCE-TABLES-3.8 DOCE-TABLES-3.9 types into the cells that menu inserts and splits add, and sets a header column', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    await insertTable(page);
    const table = content(page).locator('table').first();
    const menu = (name: string) => page.getByRole('menuitem', { name, exact: true }).click();
    await table.locator('td').first().click({ button: 'right' });
    await menu('Insert row');
    await menu('Row below');
    await expect(table.locator('tr')).toHaveCount(4);
    const below = table.locator('tr').nth(2).locator('td').first();
    await below.click();
    await page.keyboard.type('Below');
    await expect(below).toHaveText('Below');
    // A split puts the caret in the cell it adds, where typing goes.
    await below.click({ button: 'right' });
    await menu('Split cell');
    await menu('Into two columns');
    await page.keyboard.type('Right');
    await expect(below.locator('xpath=following-sibling::td[1]')).toHaveText('Right');
    await below.click({ button: 'right' });
    await menu('Split cell');
    await menu('Into two rows');
    await page.keyboard.type('Under');
    await expect(table.locator('tr').nth(3).locator('td').first()).toHaveText('Under');
    await expect(below).toHaveText('Below');
    // The first column becomes a header column; the columns after it stay plain.
    const last = table.locator('tr').last();
    await last.locator('td').first().click({ button: 'right' });
    await menu('Header');
    await menu('Header column');
    await expect(last.locator('th')).toHaveCount(1);
    await expect(last.locator('td')).toHaveCount(2);
  });

  test('DOCE-TABLES-3.8 makes a row in the middle of a table a header row and plain again', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    const run = cell(page, 'Run');
    await run.scrollIntoViewIfNeeded();
    const row = run.locator('xpath=ancestor::tr[1]');
    const above = row.locator('xpath=preceding-sibling::tr[1]');
    const aboveHeaders = await above.locator('th').count();
    const menuItem = (name: string) => page.getByRole('menuitem', { name, exact: true }).click();
    await run.click({ button: 'right' });
    await menuItem('Header');
    await menuItem('Header row');
    await expect(row.locator('td')).toHaveCount(0);
    await expect(above.locator('th')).toHaveCount(aboveHeaders);
    await cell(page, 'Run').click({ button: 'right' });
    await menuItem('Header');
    await menuItem('Header row');
    await expect(row.locator('th')).toHaveCount(0);
  });

  test('DOCE-TABLES-3.5 DOCE-TABLES-3.11 clears the selected cells when a click puts the caret outside the table', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    await cell(page, 'Start').scrollIntoViewIfNeeded();
    await cell(page, 'Start').click({ modifiers: ['ControlOrMeta'] });
    await cell(page, 'Run').click({ modifiers: ['ControlOrMeta'] });
    await expect(selected(page)).toHaveCount(2);
    const heading = content(page).locator('h1, h2, h3').first();
    await heading.scrollIntoViewIfNeeded();
    await heading.click();
    await page.keyboard.press('End');
    await expect(selected(page)).toHaveCount(0);
    await page.keyboard.type(' typed');
    await expect(heading).toContainText(' typed');
    await expect(cell(page, 'Start')).toHaveText('Start');
  });

  test('DOCE-PAGINATION-7.11 keeps one cell selected when a drag comes back to its first cell', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    await cell(page, 'Stop').scrollIntoViewIfNeeded();
    const from = await padding(page, 'Run');
    const to = await padding(page, 'Stop');
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 6 });
    await expect(selected(page)).toHaveCount(2);
    await page.mouse.move(from.x + 4, from.y, { steps: 6 });
    await page.mouse.up();
    await expect(selected(page)).toHaveCount(1);
    await expect(cell(page, 'Run')).toHaveClass(/selectedCell/);
  });

  test('DOCE-PAGINATION-7.11 DOCE-TABLES-3.11 drags cells across the pages and back, and selects the split table from either part', async ({
    lab,
    page,
  }) => {
    // Tall enough that both parts of the lab's first table, on facing pages, are in view.
    await page.setViewportSize({ width: 1280, height: 1400 });
    await lab.open('document-editor');
    await cell(page, 'Start').scrollIntoViewIfNeeded();
    const id = await cell(page, 'Start').evaluate(
      (element) => element.closest('table')?.dataset.id,
    );
    const parts = content(page).locator(`table[data-id="${String(id)}"]`);
    expect(await parts.count()).toBeGreaterThanOrEqual(2);
    const to = await padding(page, 'Run');
    const from = await padding(page, 'Start');
    expect(await padding(page, 'Run')).toEqual(to);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await expect(cell(page, 'Run')).toHaveClass(/selectedCell/);
    await page.mouse.move(from.x + 4, from.y, { steps: 8 });
    await page.mouse.up();
    await expect(selected(page)).toHaveCount(1);
    await expect(cell(page, 'Start')).toHaveClass(/selectedCell/);
    // A double click in a cell's padding, on the second part, selects every cell of every part;
    // the header row the second part repeats is a drawing of the first part's.
    await settle(page);
    await page.mouse.dblclick(to.x, to.y);
    const first = parts.nth(0).locator('td, th');
    await expect(parts.nth(0).locator('.selectedCell')).toHaveCount(await first.count());
    const rest = parts.nth(1).locator('td');
    await expect(parts.nth(1).locator('td.selectedCell')).toHaveCount(await rest.count());
  });

  test('DOCE-PAGINATION-7.11 lets a text selection after a cell drag stand, and follow each new drag', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    await cell(page, 'Stop').scrollIntoViewIfNeeded();
    const from = await padding(page, 'Run');
    const to = await padding(page, 'Stop');
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 6 });
    await page.mouse.up();
    await expect(selected(page)).toHaveCount(2);
    // Each drag over a paragraph's text outside the table selects from where it was pressed.
    const paragraphs = content(page).locator('p:not(td p, th p)');
    for (const index of [0, 1]) {
      const paragraph = paragraphs.nth(index);
      await paragraph.scrollIntoViewIfNeeded();
      const box = await paragraph.boundingBox();
      if (!box) throw new Error('The paragraph is not drawn');
      await settle(page);
      await page.mouse.move(box.x + 1, box.y + 8);
      await page.mouse.down();
      await page.mouse.move(box.x + 60, box.y + 8, { steps: 6 });
      await page.mouse.up();
      await expect(selected(page)).toHaveCount(0);
      const text = (await paragraph.textContent()) ?? '';
      await expect.poll(() => selectedText(page)).not.toBe('');
      await page.waitForTimeout(300);
      const chosen = await selectedText(page);
      expect(text.startsWith(chosen)).toBe(true);
    }
    // Typing replaces the text selection, not the cells.
    const last = paragraphs.nth(1);
    const before = (await last.textContent()) ?? '';
    const chosen = await selectedText(page);
    await page.keyboard.type('Typed');
    await expect(last).toHaveText(`Typed${before.slice(chosen.length)}`);
    await expect(cell(page, 'Run')).toHaveText('Run');
  });

  test('DOCE-TABLES-1.6 DOCE-EDITOR-4.5 inserts a table of the size hovered in the toolbar at the caret', async ({
    lab,
    page,
  }) => {
    await lab.open('full-editor');
    const heading = content(page).locator('h1').first();
    await heading.click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Lead text');
    const tables = await content(page).locator('table').count();
    await page
      .getByRole('toolbar', { name: 'Formatting' })
      .getByRole('button', { name: 'Insert table' })
      .click();
    const picker = page.getByRole('grid', { name: 'Insert table' });
    // Focus in the picker leaves the document's selection behind; the editor's caret stands.
    await page.evaluate(() => window.getSelection()?.removeAllRanges());
    const size = picker.getByRole('gridcell', { name: '3 rows by 2 columns' });
    await size.hover();
    await expect(picker.locator('[data-in-range]')).toHaveCount(6);
    await size.click();
    await expect(picker).toBeHidden();
    await expect(content(page).locator('table')).toHaveCount(tables + 1);
    const lead = content(page).locator('p', { hasText: 'Lead text' });
    await expect(lead).toHaveText('Lead text');
    const table = lead
      .locator('xpath=following-sibling::*[1]')
      .locator('table')
      .or(lead.locator('xpath=following-sibling::table[1]'));
    await expect(table.locator('tr')).toHaveCount(3);
    await expect(table.locator('tr').first().locator('td, th')).toHaveCount(2);
    await page.keyboard.type('First');
    await expect(table.locator('td, th').first()).toHaveText('First');
  });
});
