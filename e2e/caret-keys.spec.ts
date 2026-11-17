import type { Page } from '@playwright/test';
import { expect, type LabFixture, test } from './fixtures.js';

const content = (page: Page) => page.locator('.de-document-editor__content');
const pages = (page: Page) => content(page).locator('.pm-page');
const blocks = (page: Page, index: number) =>
  pages(page).nth(index).locator('.pm-page-content > *');

// Opens the editor lab once its pages are laid out for good, so clicks land where they aim.
async function openEditor(lab: LabFixture, page: Page) {
  await lab.open('document-editor');
  await expect(page.locator('.de-document-editor')).toHaveAttribute('data-layout-state', 'settled');
}

// The page index and text of the block the browser's selection ends in, with what it selects.
function selection(page: Page) {
  return page.evaluate(() => {
    const chosen = getSelection();
    const place = (node: Node | null | undefined) => {
      const element = node?.nodeType === 1 ? (node as Element) : node?.parentElement;
      const all = [...document.querySelectorAll('.de-document-editor__content .pm-page')];
      const at = element?.closest('.pm-page');
      const block = element?.closest('.pm-page-content > *, .pm-section > *');
      return { page: at ? all.indexOf(at) : -1, text: (block?.textContent ?? '').slice(0, 24) };
    };
    return {
      anchor: place(chosen?.anchorNode),
      focus: place(chosen?.focusNode),
      selected: chosen?.toString() ?? '',
    };
  });
}

// Clicks a block's text near its start, the block scrolled into view first.
async function clickInto(page: Page, index: number, which: 'first' | 'last', dx = 12) {
  const block = which === 'first' ? blocks(page, index).first() : blocks(page, index).last();
  await block.scrollIntoViewIfNeeded();
  const box = await block.boundingBox();
  if (!box) throw new Error('The block is not shown.');
  await page.mouse.click(box.x + dx, box.y + 8);
}

// The index of the page whose content holds a text, or -1.
function pageHolding(page: Page, value: string) {
  return pages(page).evaluateAll(
    (all, text) =>
      all.findIndex((one) => one.querySelector('.pm-page-content')?.textContent?.includes(text)),
    value,
  );
}

test.describe('caret keys across pages', () => {
  test('DOCE-PAGINATION-7.21 goes to the first and last text with Mod-Home and Mod-End, past a list of contents', async ({
    lab,
    page,
  }) => {
    await openEditor(lab, page);
    await expect(blocks(page, 0).first()).toHaveClass(/de-contents/);
    await clickInto(page, 2, 'last');
    await page.keyboard.press('ControlOrMeta+Home');
    await page.keyboard.type('Qa');
    await expect.poll(() => pageHolding(page, 'Qa')).toBe(0);
    expect((await blocks(page, 0).nth(1).textContent())?.startsWith('Qa')).toBe(true);
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type('Qz');
    const last = (await pages(page).count()) - 1;
    await expect.poll(() => pageHolding(page, 'Qz')).toBe(last);
    expect((await blocks(page, last).last().textContent())?.endsWith('Qz')).toBe(true);
    // Shift extends the selection from where it stands to the first text.
    await page.keyboard.press('ControlOrMeta+Shift+Home');
    await expect.poll(async () => (await selection(page)).selected).toMatch(/Qa[\s\S]*Qz/);
    const all = await selection(page);
    expect(all.anchor.page).toBe(last);
    expect(all.focus.page).toBe(0);
  });

  test('DOCE-PAGINATION-7.21 selects across a page boundary with Shift+ArrowUp and Shift+click', async ({
    lab,
    page,
  }) => {
    await openEditor(lab, page);
    const count = await pages(page).count();
    const into = count - 1;
    await clickInto(page, into, 'first', 2);
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+ArrowUp');
    await expect.poll(async () => (await selection(page)).focus.page).toBe(into - 1);
    const up = await selection(page);
    expect(up.anchor.page).toBe(into);
    expect(up.selected.length).toBeGreaterThan(0);
    // Shift+click from one page to the next selects everything between.
    const from = blocks(page, 0).filter({ hasText: 'Each requirement' }).last();
    await from.scrollIntoViewIfNeeded();
    await from.click();
    const next = blocks(page, 1).filter({ hasText: 'Each requirement' }).first();
    await next.scrollIntoViewIfNeeded();
    const box = await next.boundingBox();
    await page.keyboard.down('Shift');
    await page.mouse.click((box?.x ?? 0) + 40, (box?.y ?? 0) + 8);
    await page.keyboard.up('Shift');
    await expect.poll(async () => (await selection(page)).focus.page).toBe(1);
    const clicked = await selection(page);
    expect(clicked.anchor.page).toBe(0);
    expect(clicked.selected.length).toBeGreaterThan(20);
  });

  test('DOCE-PAGINATION-7.21 moves with Home, End and Page Down, and deletes words with Mod-Backspace and Mod-Delete', async ({
    lab,
    page,
  }) => {
    await openEditor(lab, page);
    const paragraph = blocks(page, 1).filter({ hasText: 'Each requirement' }).first();
    await paragraph.scrollIntoViewIfNeeded();
    const box = await paragraph.boundingBox();
    if (!box) throw new Error('The paragraph is not shown.');
    // The second line of a wrapped paragraph: Home and End keep to that line.
    await page.mouse.click(box.x + box.width / 2, box.y + 30);
    await page.keyboard.press('Home');
    await page.keyboard.type('[');
    await page.keyboard.press('End');
    await page.keyboard.type(']');
    const text = (await paragraph.textContent()) ?? '';
    expect(text.startsWith('[')).toBe(false);
    expect(text.indexOf('[')).toBeLessThan(text.indexOf(']'));
    await page.keyboard.press('PageDown');
    await expect.poll(async () => (await selection(page)).focus.page).toBeGreaterThanOrEqual(1);
    await page.keyboard.press('ControlOrMeta+Home');
    await page.keyboard.type('alpha beta gamma');
    await page.keyboard.press('ControlOrMeta+Backspace');
    await expect(blocks(page, 0).nth(1)).toContainText('alpha beta ');
    await expect(blocks(page, 0).nth(1)).not.toContainText('gamma');
    await page.keyboard.press('ControlOrMeta+ArrowLeft');
    await page.keyboard.press('ControlOrMeta+ArrowLeft');
    await page.keyboard.press(process.platform === 'darwin' ? 'Alt+Delete' : 'Control+Delete');
    await expect(blocks(page, 0).nth(1)).not.toContainText('alpha');
    await expect(blocks(page, 0).nth(1)).toContainText('beta');
  });

  test('DOCE-PAGINATION-7.21 DOCE-PAGINATION-7.22 selects a word and a paragraph with double and triple clicks on a later page', async ({
    lab,
    page,
  }) => {
    await openEditor(lab, page);
    const last = (await pages(page).count()) - 1;
    const paragraph = blocks(page, last).filter({ hasText: 'Each requirement' }).first();
    await paragraph.scrollIntoViewIfNeeded();
    const box = await paragraph.boundingBox();
    if (!box) throw new Error('The paragraph is not shown.');
    await page.mouse.dblclick(box.x + 40, box.y + 8);
    await expect.poll(async () => (await selection(page)).selected).toBe('requirement');
    // A pause, so the triple click starts a click sequence of its own.
    await page.waitForTimeout(800);
    await page.mouse.click(box.x + 40, box.y + 8, { clickCount: 3 });
    const whole = (await paragraph.textContent())?.trim();
    await expect.poll(async () => (await selection(page)).selected.trim()).toBe(whole);
    await page.keyboard.type('Replaced');
    // The shorter paragraph may move to the page before.
    await expect
      .poll(() =>
        content(page)
          .locator('p')
          .evaluateAll((all) =>
            all
              .filter((one) => one.textContent?.includes('Replaced'))
              .map((one) => one.textContent),
          ),
      )
      .toEqual(['Replaced']);
  });

  test('DOCE-PAGINATION-7.21 DOCE-PAGINATION-7.22 keeps the pages and the document in step through Shift+ArrowRight, Delete, Backspace and Enter', async ({
    lab,
    page,
  }) => {
    await openEditor(lab, page);
    const paragraph = blocks(page, 1).filter({ hasText: 'Each requirement' }).first();
    await paragraph.scrollIntoViewIfNeeded();
    const box = await paragraph.boundingBox();
    if (!box) throw new Error('The paragraph is not shown.');
    await page.mouse.click(box.x + 2, box.y + 8);
    // The keys go where the click put the caret, once the editor has it.
    await expect.poll(async () => (await selection(page)).focus.text).toMatch(/^Each requirement/);
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+ArrowRight');
    await expect.poll(async () => (await selection(page)).selected).toBe('E');
    await page.keyboard.press('Delete');
    await expect(paragraph).toHaveText(/^ach requirement/);
    await page.keyboard.press('Delete');
    await page.keyboard.type('E');
    await expect(paragraph).toHaveText(/^Ech requirement/);
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Split');
    // After the pause the layout draws the pages again, and the text stays as typed.
    await expect(page.locator('.de-document-editor')).toHaveAttribute(
      'data-layout-state',
      'settled',
    );
    await expect(content(page)).toContainText('Split');
    await expect(content(page).locator('p', { hasText: /^Splitch requirement/ })).toHaveCount(1);
  });

  test('DOCE-PAGINATION-7.21 types into a blank document from a click in the middle of its page', async ({
    lab,
    page,
  }) => {
    await openEditor(lab, page);
    await page.getByRole('button', { name: 'Blank document' }).click();
    await expect(pages(page)).toHaveCount(1);
    await expect(blocks(page, 0)).toHaveCount(1);
    await pages(page)
      .first()
      .evaluate((one) => one.scrollIntoView({ block: 'center' }));
    const box = await pages(page).first().boundingBox();
    if (!box) throw new Error('The page is not shown.');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.type('Fresh start');
    await expect(blocks(page, 0)).toHaveCount(1);
    await expect(blocks(page, 0).first()).toHaveText('Fresh start');
  });

  test('DOCE-PAGINATION-7.21 puts the caret at the end of the page clicked below its last block', async ({
    lab,
    page,
  }) => {
    await openEditor(lab, page);
    const count = await pages(page).count();
    let found = -1;
    for (let index = 0; index < count - 1 && found < 0; index += 1) {
      const room = await pages(page)
        .nth(index)
        .locator('.pm-page-content')
        .evaluate((element) => {
          const last = element.lastElementChild?.getBoundingClientRect();
          return element.getBoundingClientRect().bottom - (last?.bottom ?? 0);
        });
      if (room > 24) found = index;
    }
    expect(found).toBeGreaterThanOrEqual(0);
    const area = pages(page).nth(found).locator('.pm-page-content');
    await area.evaluate((element) => element.scrollIntoView({ block: 'end' }));
    const box = await area.boundingBox();
    if (!box) throw new Error('The page is not shown.');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height - 8);
    await page.keyboard.type('Qe');
    await expect.poll(() => pageHolding(page, 'Qe')).toBe(found);
    const lastText = await blocks(page, found).last().textContent();
    expect(lastText?.endsWith('Qe')).toBe(true);
  });

  test('DOCE-PAGINATION-7.21 moves with the same keys in the web layout', async ({ lab, page }) => {
    await openEditor(lab, page);
    await page.getByLabel('Web layout').check();
    const paragraph = content(page).locator('p', { hasText: 'Each requirement' }).last();
    await paragraph.scrollIntoViewIfNeeded();
    await paragraph.click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.press('ControlOrMeta+Shift+Home');
    await expect.poll(async () => (await selection(page)).selected.length).toBeGreaterThan(1000);
    await page.keyboard.press('ControlOrMeta+Home');
    await page.keyboard.type('Qw');
    await expect(content(page).locator('h1, p').first()).toHaveText(/^Qw/);
  });

  test('DOCE-PAGINATION-7.21 selects across pages without changing a read document', async ({
    lab,
    page,
  }) => {
    await openEditor(lab, page);
    await page.getByLabel('Authoring').uncheck();
    const before = await content(page).textContent();
    await clickInto(page, 0, 'last');
    const next = blocks(page, 1).first();
    await next.scrollIntoViewIfNeeded();
    const box = await next.boundingBox();
    await page.keyboard.down('Shift');
    await page.mouse.click((box?.x ?? 0) + 40, (box?.y ?? 0) + 8);
    await page.keyboard.up('Shift');
    await expect.poll(async () => (await selection(page)).selected.length).toBeGreaterThan(20);
    for (const key of ['Delete', 'Backspace', 'Enter', 'ControlOrMeta+Home', 'PageDown', 'x']) {
      await page.keyboard.press(key);
    }
    expect(await content(page).textContent()).toBe(before);
  });
});
