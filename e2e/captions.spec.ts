import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const content = (page: Page) => page.locator('.de-document-editor__content');
// The first table with its caption, and its caption line.
const firstHolder = (page: Page) => content(page).locator('.doc-table-figure').first();
const firstTable = (page: Page) => firstHolder(page).locator('table');
const captionOf = (page: Page) => firstHolder(page).locator('.doc-table-caption-line');
const selected = (page: Page) => page.evaluate(() => String(window.getSelection()));
const item = (page: Page, name: string | RegExp) =>
  page.getByRole('menu').last().getByRole('menuitem', { name });

test.describe('captions', () => {
  test.beforeEach(async ({ lab }) => {
    await lab.open('full-editor');
  });

  test('DOCE-OBJECTS-2.2 shows a table caption line with its label, number and text', async ({
    page,
  }) => {
    const caption = captionOf(page);
    await expect(caption).toHaveText('Scope limits');
    const label = await caption.evaluate(
      (element) => getComputedStyle(element, '::before').content,
    );
    expect(label).toContain('Table');
    // A figure counts its own kind.
    const figureLabel = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.className = 'doc-caption-line doc-figure-caption-line';
      document.querySelector('.de-document-editor')?.appendChild(probe);
      const value = getComputedStyle(probe, '::before').content;
      probe.remove();
      return value;
    });
    expect(figureLabel).toContain('Figure');
  });

  test('DOCE-OBJECTS-2.1 edits and hides a caption from the context menu', async ({ page }) => {
    await firstTable(page).getByText('Start').click({ button: 'right' });
    await item(page, 'Edit caption').click();
    // The caption's text is selected, in place: typing replaces it.
    await expect.poll(() => selected(page)).toBe('Scope limits');
    await page.keyboard.type('Scope timing limits');
    await expect(captionOf(page)).toHaveText('Scope timing limits');
    await firstTable(page).getByText('Start').click({ button: 'right' });
    await item(page, 'Hide caption').click();
    await expect(captionOf(page)).toBeHidden();
    await expect(firstTable(page)).toHaveAttribute('data-caption-enabled', 'false');
  });

  test('DOCE-OBJECTS-2.5 edits a table caption as any text, one line, in the document at once', async ({
    page,
  }) => {
    const caption = captionOf(page);
    const text = caption.locator('.doc-caption-text');
    await caption.scrollIntoViewIfNeeded();
    const box = await text.boundingBox();
    if (!box) throw new Error('The caption is not drawn');
    // A click puts the caret where it is pressed: here, at the end of the text.
    await page.mouse.click(box.x + box.width - 1, box.y + box.height / 2);
    await page.keyboard.type(' now');
    await expect(caption).toHaveText('Scope limits now');
    // A double click selects a word, and Select All selects the caption only.
    await page.waitForTimeout(600);
    await text.dblclick({ position: { x: 4, y: box.height / 2 } });
    await expect.poll(() => selected(page)).toBe('Scope');
    await page.keyboard.press('ControlOrMeta+A');
    await expect.poll(() => selected(page)).toBe('Scope limits now');
    // A press and drag selects text, which stays selected.
    await page.mouse.move(box.x + 1, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 3, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect.poll(() => selected(page)).toMatch(/^Sco/);
    await page.waitForTimeout(300);
    expect(await selected(page)).toMatch(/^Sco/);
    // Enter adds no line, and Backspace at its start joins it to nothing.
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Home');
    await page.keyboard.press('Backspace');
    await expect(caption).toHaveText('Scope limits now');
    await expect(firstHolder(page).locator('.doc-caption-line')).toHaveCount(1);
    // What was typed is one change the writer undoes.
    await page.keyboard.press('ControlOrMeta+Z');
    await expect(caption).toHaveText('Scope limits');
  });

  test('DOCE-TABLES-3.1 aligns a cell from the context menu', async ({ page }) => {
    const cell = firstTable(page).locator('td', { hasText: '25 ms' });
    await cell.click({ button: 'right' });
    await item(page, 'Align cells').click();
    await item(page, 'Bottom right').click();
    await expect(cell).toHaveAttribute('data-text-align', 'right');
    await expect(cell).toHaveAttribute('data-vertical-align', 'bottom');
  });
});
