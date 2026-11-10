import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

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

  test('DOCE-TABLES-2.4 resizes a column by dragging the border between its cells', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    const first = cell(page, 'Start');
    await first.scrollIntoViewIfNeeded();
    const box = await first.boundingBox();
    if (!box) throw new Error('The cell is not drawn');
    const border = { x: box.x + box.width - 1, y: box.y + box.height / 2 };
    await page.mouse.move(border.x - 10, border.y);
    await page.mouse.move(border.x, border.y, { steps: 3 });
    await page.mouse.down();
    await page.mouse.move(border.x - 120, border.y, { steps: 6 });
    await page.mouse.up();
    await expect(first).toHaveAttribute('data-colwidth', /^\d+$/);
    const width = Number(await first.getAttribute('data-colwidth'));
    expect(Math.abs(width - (box.width - 120))).toBeLessThan(12);
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
