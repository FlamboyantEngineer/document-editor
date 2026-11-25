import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const content = (page: Page) => page.locator('.de-document-editor__content');
const editor = (page: Page) => page.locator('.de-document-editor').first();
const block = (page: Page, id: string) => content(page).locator(`[data-id="${id}"]`).first();
const status = (page: Page, item: string) =>
  editor(page).locator(`[data-status="${item}"]`).first();
const log = (page: Page) => page.getByRole('list', { name: 'Host log' });
const settled = (page: Page) =>
  expect(editor(page)).toHaveAttribute('data-layout-state', 'settled');

// Puts the caret at the end of the block with this id.
async function caretAtEnd(page: Page, id: string) {
  await block(page, id).click();
  await page.keyboard.press('End');
}

test.describe('editor options', () => {
  test('DOCE-LABS-3.9 DOCE-EDITING-10.2 DOCE-EDITOR-5.7 refuses words past the content limit, and shows a collaborator past it', async ({
    lab,
    page,
  }) => {
    await lab.open('editor-options');
    await page.getByLabel('Content limit').selectOption('words');
    const words = status(page, 'words');
    await expect(words).toHaveText(/\d+ \/ \d+ words/);
    const [used, limit] = ((await words.textContent()) ?? '').match(/\d+/g)?.map(Number) ?? [];
    expect((limit ?? 0) - (used ?? 0)).toBe(5);
    await caretAtEnd(page, 'a0f00002');
    await page.keyboard.type(' one two three four five six seven eight');
    await expect(words).toHaveText(`${String(limit)} / ${String(limit)} words`);
    await expect(block(page, 'a0f00002')).not.toContainText('six seven');
    await expect(words.locator('[data-over]')).toHaveAttribute('data-over', 'false');

    await page.getByRole('button', { name: "Add a collaborator's paragraph" }).click();
    await expect(content(page)).toContainText('A collaborator added this paragraph');
    await expect(words.locator('[data-over]')).toHaveAttribute('data-over', 'true');
  });

  test('DOCE-LABS-3.9 DOCE-EDITING-10.3 keeps a paragraph after a section that ends with a table', async ({
    lab,
    page,
  }) => {
    await lab.open('editor-options');
    const after = (id: string) =>
      block(page, id).evaluate((table) => {
        // The table's block on its page, and the block after it.
        let top: Element = table;
        while (top.parentElement && !top.parentElement.classList.contains('pm-page-content'))
          top = top.parentElement;
        const next = top.nextElementSibling;
        return next ? `${next.tagName}:${next.textContent ?? ''}` : 'none';
      });
    expect(await after('a0f00009')).toBe('none');
    await page.getByLabel('Trailing paragraph').check();
    await caretAtEnd(page, 'a0f00002');
    await page.keyboard.type('!');
    await expect.poll(() => after('a0f00009')).toBe('P:');
  });

  test('DOCE-LABS-3.9 DOCE-EDITING-3.1 DOCE-EDITING-6.5 turns the typing shortcuts off by group', async ({
    lab,
    page,
  }) => {
    await lab.open('editor-options');
    await caretAtEnd(page, 'a0f00002');
    await page.keyboard.press('Enter');
    await page.keyboard.type('## Rooms');
    await expect(content(page).locator('h2', { hasText: 'Rooms' })).toHaveCount(1);
    await page.keyboard.press('Enter');

    await page.getByLabel('Typing shortcuts: blocks').uncheck();
    await caretAtEnd(page, 'a0f00003');
    await page.keyboard.press('Enter');
    await page.keyboard.type('## Floors');
    await expect(content(page).locator('p', { hasText: '## Floors' })).toHaveCount(1);
    await expect(content(page).locator('h2', { hasText: 'Floors' })).toHaveCount(0);
  });

  test('DOCE-LABS-3.9 DOCE-PAGINATION-5.11 keeps tables whole with the host layout rules', async ({
    lab,
    page,
  }) => {
    await lab.open('editor-options');
    const parts = () =>
      block(page, 'a0f00007').evaluate(
        (table) =>
          table.ownerDocument.querySelectorAll(
            `.de-document-editor__content table[data-id="${table.getAttribute('data-id') ?? ''}"]`,
          ).length,
      );
    // The table is one part until the first layout splits it.
    await settled(page);
    expect(await parts()).toBe(2);
    await page.getByLabel('Keep tables whole on a page').check();
    await settled(page);
    await expect.poll(parts).toBe(1);
  });

  test('DOCE-LABS-3.9 DOCE-SCHEMA-1.4 DOCE-SCHEMA-3.3 renders with the host presentation and previews assets as of a time', async ({
    lab,
    page,
  }) => {
    await lab.open('editor-options');
    await expect(content(page).locator('a', { hasText: 'survey method' })).toHaveAttribute(
      'data-tip',
      'The method, revision 2',
    );
    await expect(content(page).locator('.lab-mention')).toHaveText('@Alex Doe');
    const image = block(page, 'a0f00010').locator('img');
    await expect(image).toHaveAttribute('src', /floor-plan%20r3%3C/);
    await page.getByLabel('Assets as of').selectOption('2026-01-31');
    await expect(image).toHaveAttribute('src', /as%20of%202026-01-31/);
  });

  test('DOCE-LABS-3.9 DOCE-SCHEMA-2.3 DOCE-EDITING-1.7 stamps drafts and freezes an approved element', async ({
    lab,
    page,
  }) => {
    await lab.open('editor-options');
    const paragraph = block(page, 'a0f00003');
    await expect(paragraph).toHaveAttribute('data-review-state', 'draft');
    await caretAtEnd(page, 'a0f00003');
    await page.getByRole('button', { name: 'Approve the element at the caret' }).click();
    await expect(paragraph).toHaveAttribute('data-review-state', 'approved');
    await expect(page.getByRole('status', { name: 'Review state' })).toHaveText(
      'paragraph: approved',
    );
    const before = await paragraph.textContent();
    await caretAtEnd(page, 'a0f00003');
    await page.keyboard.type(' changed');
    await expect(paragraph).toHaveText(before ?? '');
    // A new element is stamped as a draft.
    await page.keyboard.press('Enter');
    await caretAtEnd(page, 'a0f00002');
    await page.keyboard.press('Enter');
    await page.keyboard.type('A new note');
    await expect(content(page).locator('p', { hasText: 'A new note' })).toHaveAttribute(
      'data-review-state',
      'draft',
    );

    await caretAtEnd(page, 'a0f00003');
    await page.getByRole('button', { name: 'Return it to draft' }).click();
    await caretAtEnd(page, 'a0f00003');
    await page.keyboard.type(' changed');
    await expect(paragraph).toContainText('changed');
  });

  test('DOCE-LABS-3.9 DOCE-EDITING-1.4 repairs a document opened with broken element ids', async ({
    lab,
    page,
  }) => {
    await lab.open('editor-options');
    const ids = page.getByRole('status', { name: 'Element ids' });
    await expect(ids).toHaveText('every element has its own id');
    await page.getByLabel('Repair element ids on opening').uncheck();
    await page.getByRole('button', { name: 'Open a document with broken ids' }).click();
    await expect(ids).toHaveText('3 missing or invalid, 1 repeated');
    await page.getByLabel('Repair element ids on opening').check();
    await page.getByRole('button', { name: 'Open the sample' }).click();
    await page.getByRole('button', { name: 'Open a document with broken ids' }).click();
    await expect(ids).toHaveText('every element has its own id');
    await expect(log(page)).toContainText('ids repaired on opening');
  });

  test('DOCE-LABS-3.9 DOCE-ENTRY-2.4 tells the writer a dialog failed to load, and loads it the next time', async ({
    lab,
    page,
  }) => {
    await lab.open('editor-options');
    const drop = page.getByRole('button', { name: 'Drop the connection for the next dialog' });
    await expect(drop).toBeEnabled();
    await drop.click();
    await expect(log(page)).toContainText('network: the next dialog fails to load');
    await caretAtEnd(page, 'a0f00002');
    const toolbar = page.getByRole('toolbar').first();
    await toolbar.getByRole('button', { name: 'Figure' }).click();
    await page.getByRole('menuitem', { name: 'Image…' }).click();
    await expect(log(page)).toContainText('feedback error');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await caretAtEnd(page, 'a0f00002');
    await toolbar.getByRole('button', { name: 'Figure' }).click();
    await page.getByRole('menuitem', { name: 'Image…' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    // The dropped request is the one error the browser reports.
    const dropped = lab.errors.filter((error) => error.includes('net::ERR_FAILED'));
    expect(dropped).toHaveLength(1);
    lab.errors.splice(0, lab.errors.length, ...lab.errors.filter((e) => !dropped.includes(e)));
  });

  test('DOCE-LABS-3.9 DOCE-EDITOR-4.20 draws the host status item only when its part of the state changes', async ({
    lab,
    page,
  }) => {
    await lab.open('editor-options');
    const item = page.getByLabel('Caret block');
    await caretAtEnd(page, 'a0f00002');
    await expect(item).toContainText('In paragraph');
    const draws = async () => Number((await item.textContent())?.match(/drawn (\d+)/)?.[1]);
    const before = await draws();
    await page.keyboard.type(' more words');
    await expect(block(page, 'a0f00002')).toContainText('more words');
    expect(await draws()).toBe(before);
    await caretAtEnd(page, 'a0f00001');
    await expect(item).toContainText('In heading');
    expect(await draws()).toBe(before + 1);
  });
});
