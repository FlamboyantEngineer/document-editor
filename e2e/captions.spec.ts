import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const content = (page: Page) => page.locator('.de-document-editor__content');
const firstTable = (page: Page) => content(page).locator('table').first();
const item = (page: Page, name: string | RegExp) =>
  page.getByRole('menu').last().getByRole('menuitem', { name });

test.describe('captions', () => {
  test.beforeEach(async ({ lab }) => {
    await lab.open('full-editor');
  });

  test('DOCE-OBJECTS-2.2 shows a table caption line with its label, number and text', async ({
    page,
  }) => {
    const caption = firstTable(page).locator('caption');
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
    await item(page, 'Edit caption…').click();
    const field = page.getByRole('dialog').getByRole('textbox', { name: 'Caption' });
    await expect(field).toHaveValue('Scope limits');
    await field.fill('Scope timing limits');
    await page.keyboard.press('Enter');
    await expect(firstTable(page).locator('caption')).toHaveText('Scope timing limits');
    await firstTable(page).getByText('Start').click({ button: 'right' });
    await item(page, 'Hide caption').click();
    await expect(firstTable(page).locator('caption')).toHaveCount(0);
    await expect(firstTable(page)).toHaveAttribute('data-caption-enabled', 'false');
  });

  test('DOCE-OBJECTS-2.5 edits a table caption in the caption itself, with the clicks of any text', async ({
    page,
  }) => {
    const caption = firstTable(page).locator('caption');
    const text = caption.locator('.doc-caption-text');
    const selected = () => page.evaluate(() => String(window.getSelection()));
    await caption.scrollIntoViewIfNeeded();
    const box = await text.boundingBox();
    if (!box) throw new Error('The caption is not drawn');
    // A click puts the caret where it is pressed: here, at the end of the text.
    await page.mouse.click(box.x + box.width - 1, box.y + box.height / 2);
    await expect(text).toBeFocused();
    await page.keyboard.type(' now');
    await expect(caption).toHaveText('Scope limits now');
    // A double click selects a word, and Select All selects the caption only.
    await page.waitForTimeout(600);
    await text.dblclick({ position: { x: 4, y: box.height / 2 } });
    await expect.poll(selected).toBe('Scope');
    await page.keyboard.press('ControlOrMeta+A');
    await expect.poll(selected).toBe('Scope limits now');
    // A press and drag selects text, which stays selected.
    await page.mouse.move(box.x + 1, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 3, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect.poll(selected).toMatch(/^Sco/);
    await page.waitForTimeout(300);
    expect(await selected()).toMatch(/^Sco/);
    // The text is the caption's once Enter commits it.
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await expect(text).not.toBeFocused();
    await expect(caption).toHaveText('Scope limits now');
    // A press on the label puts the caret at the start; Escape puts the text back.
    const line = await caption.boundingBox();
    if (!line) throw new Error('The caption is not drawn');
    await page.mouse.click(line.x + 2, line.y + line.height / 2);
    await expect(text).toBeFocused();
    await page.keyboard.type('Draft ');
    await expect(caption).toHaveText('Draft Scope limits now');
    await page.keyboard.press('Escape');
    await expect(caption).toHaveText('Scope limits now');
    // A pasted newline is a space, and focus leaving commits, as a change of its own.
    await page.waitForTimeout(600);
    await text.click();
    await page.keyboard.press('End');
    await text.evaluate((element) => {
      const data = new DataTransfer();
      data.setData('text/plain', ' and\nmore');
      element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
    });
    await firstTable(page).getByText('Start').click();
    await expect(caption).toHaveText('Scope limits now and more');
    await page.keyboard.press('ControlOrMeta+Z');
    await expect(caption).toHaveText('Scope limits now');
  });

  test('DOCE-OBJECTS-2.5 opens no field over a table caption, and commits what is typed over its selected text', async ({
    page,
  }) => {
    const caption = firstTable(page).locator('caption');
    await firstTable(page).getByText('Start').click();
    await expect(firstTable(page)).not.toHaveAttribute('data-caption-editing');
    await caption.locator('.doc-caption-text').click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('Scope timing limits');
    await expect(firstTable(page).locator('.de-object-editors__field')).toHaveCount(0);
    await page.keyboard.press('Enter');
    await expect(caption).toHaveText('Scope timing limits');
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
