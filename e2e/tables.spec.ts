import type { Page } from '@playwright/test';
import { expect, test, waitForLab } from './fixtures.js';

const content = (page: Page) => page.locator('.de-document-editor__content');
const cell = (page: Page, text: string) =>
  content(page).locator('td, th', { hasText: text }).first();
const grip = (page: Page, axis: 'row' | 'column') =>
  page.locator(`.de-table-handles__grip[data-axis="${axis}"]`).getByRole('button');

// The rows of the lab's first table, in each part the pages split it into, as their cells' text.
function parts(page: Page) {
  return content(page)
    .locator('table')
    .evaluateAll((tables) =>
      tables.slice(0, 2).map((table) =>
        Array.from((table as HTMLTableElement).rows).map((row) =>
          Array.from(row.cells)
            .map((each) => each.textContent)
            .join('|'),
        ),
      ),
    );
}

// The rows of the lab's first table, its parts joined, without the header rows repeated on later
// parts.
const whole = async (page: Page) =>
  (await parts(page)).flatMap((part, index) => (index === 0 ? part : part.slice(1)));

// Rests the pointer on a cell, brought into view, so its table shows its handles.
async function hover(page: Page, text: string) {
  await cell(page, text).scrollIntoViewIfNeeded();
  await cell(page, text).hover();
  await expect(grip(page, 'row')).toBeVisible();
}

// Drags a grip, past the drag distance, to a point.
async function dragGrip(page: Page, axis: 'row' | 'column', to: { x: number; y: number }) {
  const box = await grip(page, axis).boundingBox();
  if (!box) throw new Error('The grip is not drawn');
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 6, start.y + 6, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
}

test.describe('table handles', () => {
  test('DOCE-TABLES-2.1 shows the grips of the row and column under the pointer', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    // The table's first part holds its header and Start, under its caption.
    await hover(page, 'Start');
    await expect(page.getByRole('button', { name: 'Row 2' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Column 1' })).toBeVisible();
    const row = page.locator('.de-table-handles__grip[data-axis="row"]');
    await expect(row).toHaveAttribute('style', /--de-table-handles-top: -?\d+px/);
    await cell(page, 'Limit').hover();
    await expect(page.getByRole('button', { name: 'Column 2' })).toBeVisible();
    await page.getByRole('heading', { name: 'Document editor', level: 1 }).hover();
    await expect(page.locator('.de-table-handles__grip')).toHaveCount(0);
  });

  test('DOCE-TABLES-2.1 shows no grips unless the host asks for them', async ({ lab, page }) => {
    await lab.open('document-editor');
    await page.getByRole('checkbox', { name: 'Table handles' }).uncheck();
    await cell(page, 'Start').scrollIntoViewIfNeeded();
    await cell(page, 'Start').hover();
    await expect(cell(page, 'Start')).toBeVisible();
    await expect(page.locator('.de-table-handles__grip')).toHaveCount(0);
    await expect(page.locator('.de-table-handles')).toHaveCount(0);
  });

  test('DOCE-TABLES-2.2 drags a row and a column, in every part of a split table', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    expect(await parts(page)).toEqual([
      ['Condition|Limit', 'Start|25 ms'],
      ['Condition|Limit', 'Run|50 ms', 'Stop|75 ms'],
    ]);
    await hover(page, 'Run');
    const start = await cell(page, 'Start').boundingBox();
    if (!start) throw new Error('The cell is not drawn');
    await dragGrip(page, 'row', { x: start.x, y: start.y + 4 });
    await expect(page.locator('.de-table-handles')).toHaveAttribute('data-dragging', 'row');
    await expect(page.locator('.de-table-handles__drop-indicator')).toHaveAttribute(
      'data-axis',
      'row',
    );
    await page.mouse.up();
    await expect
      .poll(() => parts(page))
      .toEqual([
        ['Condition|Limit', 'Run|50 ms'],
        ['Condition|Limit', 'Start|25 ms', 'Stop|75 ms'],
      ]);

    await hover(page, 'Run');
    const limit = await cell(page, '50 ms').boundingBox();
    if (!limit) throw new Error('The cell is not drawn');
    await dragGrip(page, 'column', { x: limit.x + limit.width - 4, y: limit.y });
    await page.mouse.up();
    await expect
      .poll(() => parts(page))
      .toEqual([
        ['Limit|Condition', '50 ms|Run'],
        ['Limit|Condition', '25 ms|Start', '75 ms|Stop'],
      ]);
  });

  test('DOCE-TABLES-2.2 cancels a drag with Escape or where the row cannot go', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    const before = await parts(page);
    await hover(page, 'Start');
    const start = await cell(page, 'Start').boundingBox();
    if (!start) throw new Error('The cell is not drawn');
    // Below its own row, Start would stay where it is.
    await dragGrip(page, 'row', { x: start.x, y: start.y + start.height - 4 });
    await expect(page.locator('.de-table-handles__drop-indicator')).toHaveCount(0);
    await page.mouse.up();
    // Run is on the next page: Start is measured again once Run is in view.
    await hover(page, 'Run');
    const above = await cell(page, 'Start').boundingBox();
    if (!above) throw new Error('The cell is not drawn');
    await dragGrip(page, 'row', { x: above.x, y: above.y + 4 });
    await expect(page.locator('.de-table-handles__drop-indicator')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await page.mouse.up();
    expect(await parts(page)).toEqual(before);
  });

  test('DOCE-TABLES-2.3 opens a row menu that inserts, moves and deletes the row', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    await hover(page, 'Condition');
    await grip(page, 'row').click();
    const first = page.getByRole('menu');
    await expect(first.getByRole('menuitem', { name: 'Move row up' })).toBeDisabled();
    await expect(first.getByRole('menuitem', { name: 'Move row down' })).toBeEnabled();
    await page.keyboard.press('Escape');
    await hover(page, 'Start');
    await grip(page, 'row').click();
    await page.getByRole('menu').getByRole('menuitem', { name: 'Row below' }).click();
    await expect
      .poll(() => whole(page))
      .toEqual(['Condition|Limit', 'Start|25 ms', '|', 'Run|50 ms', 'Stop|75 ms']);
    await expect(page.getByRole('textbox', { name: 'Sample document' })).toBeFocused();
    await hover(page, 'Start');
    await grip(page, 'row').click();
    await page.getByRole('menu').getByRole('menuitem', { name: 'Delete row' }).click();
    await expect
      .poll(() => whole(page))
      .toEqual(['Condition|Limit', '|', 'Run|50 ms', 'Stop|75 ms']);
  });

  test('DOCE-TABLES-2.4 resizes the columns either side of a border, keeping the table width', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    const first = cell(page, 'Start');
    const second = cell(page, '25 ms');
    await first.scrollIntoViewIfNeeded();
    const box = await first.boundingBox();
    const next = await second.boundingBox();
    const table = await content(page).locator('table').first().boundingBox();
    if (!box || !next || !table) throw new Error('The table is not drawn');
    const border = { x: box.x + box.width - 1, y: box.y + box.height / 2 };
    await page.mouse.move(border.x - 10, border.y);
    await page.mouse.move(border.x, border.y, { steps: 3 });
    await page.mouse.down();
    await page.mouse.move(border.x - 120, border.y, { steps: 6 });
    await page.mouse.up();
    await expect(first).toHaveAttribute('data-colwidth', /^\d+$/);
    const width = Number(await first.getAttribute('data-colwidth'));
    expect(Math.abs(width - (box.width - 120))).toBeLessThan(12);
    const following = Number(await second.getAttribute('data-colwidth'));
    expect(Math.abs(following - (next.width + 120))).toBeLessThan(12);
    const after = await content(page).locator('table').first().boundingBox();
    expect(Math.abs((after?.width ?? 0) - table.width)).toBeLessThan(4);
  });

  test('DOCE-TABLES-3.7 widens the last column no further than the page content', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    const last = cell(page, '25 ms');
    await last.scrollIntoViewIfNeeded();
    const box = await last.boundingBox();
    const region = await content(page)
      .locator('table')
      .first()
      .evaluate((table) => {
        const parent = table.parentElement as HTMLElement;
        const style = getComputedStyle(parent);
        return parent.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      });
    if (!box) throw new Error('The cell is not drawn');
    const border = { x: box.x + box.width - 1, y: box.y + box.height / 2 };
    await page.mouse.move(border.x - 10, border.y);
    await page.mouse.move(border.x, border.y, { steps: 3 });
    await page.mouse.down();
    await page.mouse.move(border.x + 2000, border.y, { steps: 6 });
    await page.mouse.up();
    await expect(last).toHaveAttribute('data-colwidth', /^\d+$/);
    const widths = await content(page)
      .locator('table')
      .first()
      .locator('tr')
      .first()
      .locator('th, td')
      .evaluateAll((cells) => cells.map((each) => Number(each.getAttribute('data-colwidth'))));
    const total = widths.reduce((sum, width) => sum + width, 0);
    expect(total).toBeLessThanOrEqual(region + 1);
    expect(total).toBeGreaterThan(region - 4);
  });

  test('DOCE-TABLES-2.4 resizes the columns either side of a border on the layout engine’s fixed table layout', async ({
    page,
  }) => {
    // Under the layout engine the pages draw tables at the widths the engine gives their columns
    // (`table-layout: fixed`, DOCE-PAGINATION-10.5); a resize starts from them and keeps them.
    await page.goto('regression.html?document=table-rich-cells');
    await waitForLab(page);
    const first = cell(page, 'Kind');
    const second = cell(page, 'Content');
    await first.scrollIntoViewIfNeeded();
    const box = await first.boundingBox();
    const next = await second.boundingBox();
    const table = await content(page).locator('table').first().boundingBox();
    if (!box || !next || !table) throw new Error('The table is not drawn');
    await expect(content(page).locator('table').first()).toHaveCSS('table-layout', 'fixed');
    const border = { x: box.x + box.width - 1, y: box.y + box.height / 2 };
    await page.mouse.move(border.x - 10, border.y);
    await page.mouse.move(border.x, border.y, { steps: 3 });
    await page.mouse.down();
    await page.mouse.move(border.x + 60, border.y, { steps: 6 });
    await page.mouse.up();
    await expect(first).toHaveAttribute('data-colwidth', /^\d+$/);
    const width = Number(await first.getAttribute('data-colwidth'));
    expect(Math.abs(width - (box.width + 60))).toBeLessThan(12);
    const following = Number(await second.getAttribute('data-colwidth'));
    expect(Math.abs(following - (next.width - 60))).toBeLessThan(12);
    // The pages draw the kept widths, and the table keeps its width.
    expect(Math.abs(((await first.boundingBox())?.width ?? 0) - width)).toBeLessThan(2);
    const after = await content(page).locator('table').first().boundingBox();
    expect(Math.abs((after?.width ?? 0) - table.width)).toBeLessThan(4);
  });

  test('DOCE-TABLES-3.7 widens the last column no further than the page content on the layout engine’s fixed table layout', async ({
    page,
  }) => {
    await page.goto('regression.html?document=table-merged-cells');
    await waitForLab(page);
    const table = content(page).locator('table').first();
    const last = table.locator('tr').first().locator('th, td').last();
    await last.scrollIntoViewIfNeeded();
    const box = await last.boundingBox();
    if (!box) throw new Error('The cell is not drawn');
    const border = { x: box.x + box.width - 1, y: box.y + box.height / 2 };
    await page.mouse.move(border.x - 10, border.y);
    await page.mouse.move(border.x, border.y, { steps: 3 });
    await page.mouse.down();
    await page.mouse.move(border.x + 2000, border.y, { steps: 6 });
    await page.mouse.up();
    await expect(last).toHaveAttribute('data-colwidth', /^[\d,]+$/);
    const region = await content(page)
      .locator('.pm-page-content')
      .first()
      .evaluate((element) => element.getBoundingClientRect().width);
    const columns = await table
      .locator('col')
      .evaluateAll((cols) => cols.map((col) => col.getBoundingClientRect().width));
    const total = columns.reduce((sum, width) => sum + width, 0);
    expect(total).toBeLessThanOrEqual(region + 1);
    expect(total).toBeGreaterThan(region - 4);
    // The pages draw the table at the kept widths.
    expect(Math.abs(((await table.boundingBox())?.width ?? 0) - total)).toBeLessThan(3);
  });

  test('DOCE-TABLES-3.5 DOCE-TABLES-3.6 selects cells with Ctrl clicks and drags a row taller', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    await cell(page, 'Condition').scrollIntoViewIfNeeded();
    await cell(page, 'Condition').click({ modifiers: ['ControlOrMeta'] });
    await cell(page, '25 ms').click({ modifiers: ['ControlOrMeta'] });
    await expect(content(page).locator('.selectedCell')).toHaveCount(4);
    const start = cell(page, 'Start');
    const box = await start.boundingBox();
    if (!box) throw new Error('The cell is not drawn');
    const edge = { x: box.x + box.width / 2, y: box.y + box.height - 2 };
    await page.mouse.move(edge.x, edge.y);
    await page.mouse.down();
    await page.mouse.move(edge.x, edge.y + 40, { steps: 5 });
    await page.mouse.up();
    await expect(start).toHaveAttribute('data-row-height', /^\d+$/);
    const height = Number(await start.getAttribute('data-row-height'));
    expect(Math.abs(height - (box.height + 40))).toBeLessThan(8);
  });
});
