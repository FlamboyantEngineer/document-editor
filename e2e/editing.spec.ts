import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const pages = (page: Page) => page.locator('.lab-pages .pm-page');
const content = (page: Page) => page.locator('.lab-pages .pm-page-content');

// The text of every element, by id, its split parts joined, in document order.
const elements = (page: Page) =>
  content(page).evaluateAll((regions) => {
    const texts = new Map<string, string>();
    for (const region of regions) {
      for (const block of region.querySelectorAll(':scope > [data-id]')) {
        const id = block.getAttribute('data-id') ?? '';
        texts.set(id, (texts.get(id) ?? '') + (block.textContent ?? ''));
      }
    }
    return [...texts];
  });

// A page break between two top-level paragraphs: the ids of the last block before it and the
// first after it, on the first page that starts with a paragraph.
async function breakBetweenParagraphs(page: Page, split: boolean) {
  return content(page).evaluateAll((regions, wanted) => {
    for (let index = 1; index < regions.length; index += 1) {
      const before = regions[index - 1]?.lastElementChild;
      const after = regions[index]?.firstElementChild;
      if (before?.tagName !== 'P' || after?.tagName !== 'P') continue;
      const same = before.getAttribute('data-id') === after.getAttribute('data-id');
      if (same === wanted)
        return {
          page: index,
          before: before.getAttribute('data-id') ?? '',
          after: after.getAttribute('data-id') ?? '',
        };
    }
    return null;
  }, split);
}

// Clicks a block and waits until the caret is in it.
async function caretIn(block: Locator, position?: { x: number; y: number }) {
  await block.click(position ? { position } : {});
  const id = (await block.getAttribute('data-id')) ?? '';
  await expect(block.page().locator('output[name="block-id"]')).toHaveText(id);
}

async function caretAtStart(block: Locator) {
  await caretIn(block, { x: 2, y: 4 });
  await block.page().keyboard.press('Home');
}

// The last block of the page holding the page break.
const endsPage = (page: Page) =>
  pages(page)
    .filter({ has: page.locator('hr[data-page-break]') })
    .locator('.pm-page-content > :last-child');

const scopeConditions = (page: Page) =>
  page.locator('.lab-pages h2', { hasText: 'Scope conditions' });

test.describe('editing lab', () => {
  test('DOCE-EDITING-2.3 splits a block with Enter into a new element with its own id', async ({
    lab,
    page,
  }) => {
    await lab.open('editing');
    await caretIn(scopeConditions(page));
    await page.keyboard.press('End');
    const headingId = await page.locator('output[name="block-id"]').textContent();
    await page.keyboard.press('Enter');
    await page.keyboard.type('Added');
    const added = page.locator('.lab-pages p', { hasText: /^Added$/ });
    await expect(added).toHaveCount(1);
    const id = await added.getAttribute('data-id');
    expect(id).toMatch(/^[a-f0-9]{8}$/);
    expect(id).not.toBe(headingId);
    await expect(page.locator('output[name="block-id"]')).toHaveText(id ?? '');
    await expect(added).toHaveAttribute('data-au', 'lab');
  });

  test('DOCE-EDITING-2.2 makes a list, adds an item and leaves it with Enter', async ({
    lab,
    page,
  }) => {
    await lab.open('editing');
    await caretIn(scopeConditions(page));
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('First');
    await page.keyboard.press('ControlOrMeta+Shift+8');
    const list = page.locator('.lab-pages ul', { hasText: 'First' });
    await expect(list.locator('li')).toHaveCount(1);
    await page.keyboard.press('Enter');
    await page.keyboard.type('Second');
    await expect(list.locator('li')).toHaveCount(2);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('After');
    await expect(list.locator('li')).toHaveCount(2);
    await expect(page.locator('.lab-pages p', { hasText: /^After$/ })).toHaveCount(1);
  });

  test('DOCE-EDITING-6.1 turns typed Markdown marks into a heading, a list and strong text', async ({
    lab,
    page,
  }) => {
    await lab.open('editing');
    await caretIn(scopeConditions(page));
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('## Typed heading');
    await expect(page.locator('.lab-pages h2', { hasText: /^Typed heading$/ })).toHaveCount(1);
    await page.keyboard.press('Enter');
    await page.keyboard.type('- One **bold** -- "item"');
    const item = page.locator('.lab-pages ul li', { hasText: 'One' });
    await expect(item).toHaveText('One bold \u2014 \u201citem\u201d');
    await expect(item.locator('strong')).toHaveText('bold');
  });

  test('DOCE-EDITING-7.2 makes a typed checklist item, ticks it from its box and adds a clear one on Enter', async ({
    lab,
    page,
  }) => {
    await lab.open('editing');
    await caretIn(scopeConditions(page));
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('[ ] Pack the tent');
    const item = page.locator('.lab-pages li[data-checked]', { hasText: 'Pack the tent' });
    await expect(item).toHaveAttribute('data-checked', 'false');
    await item.locator('.de-task-box').click();
    await expect(item).toHaveAttribute('data-checked', 'true');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Fill the bottles');
    const next = page.locator('.lab-pages li[data-checked]', { hasText: 'Fill the bottles' });
    await expect(next).toHaveAttribute('data-checked', 'false');
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(next).toHaveAttribute('data-checked', 'true');
  });

  test('DOCE-PAGINATION-7.15 types with a mark turned on at the caret, and without it once off', async ({
    lab,
    page,
  }) => {
    await lab.open('editing');
    await caretIn(scopeConditions(page));
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('plain ');
    await page.keyboard.press('ControlOrMeta+b');
    await page.keyboard.type('bold');
    await page.keyboard.press('ControlOrMeta+b');
    await page.keyboard.type(' after');
    const added = page.locator('.lab-pages p', { hasText: 'plain' });
    await expect(added).toHaveText('plain bold after');
    await expect(added.locator('strong')).toHaveText('bold');
  });

  test('DOCE-EDITING-6.4 takes a typed shortcut back with Backspace', async ({ lab, page }) => {
    await lab.open('editing');
    await caretIn(scopeConditions(page));
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('# ');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('kept');
    await expect(page.locator('.lab-pages p', { hasText: /^# kept$/ })).toHaveCount(1);
  });

  test('DOCE-EDITING-2.4 joins text across a page break with Backspace, and selects a page break', async ({
    lab,
    page,
  }) => {
    await lab.open('editing');
    const split = await breakBetweenParagraphs(page, true);
    expect(split).not.toBeNull();
    if (split) {
      const before = new Map(await elements(page)).get(split.before) ?? '';
      const head = await content(page)
        .nth(split.page - 1)
        .locator(`[data-id="${split.before}"]`)
        .last()
        .textContent();
      await caretAtStart(content(page).nth(split.page).locator(':scope > p').first());
      await page.keyboard.press('Backspace');
      const at = (head ?? '').length - 1;
      await expect
        .poll(async () => new Map(await elements(page)).get(split.before))
        .toBe(before.slice(0, at) + before.slice(at + 1));
    }
    const joined = await breakBetweenParagraphs(page, false);
    expect(joined).not.toBeNull();
    if (joined) {
      const texts = new Map(await elements(page));
      await caretAtStart(content(page).nth(joined.page).locator(':scope > p').first());
      await page.keyboard.press('Backspace');
      await expect
        .poll(async () => new Map(await elements(page)).get(joined.before))
        .toBe((texts.get(joined.before) ?? '') + (texts.get(joined.after) ?? ''));
      expect(new Map(await elements(page)).has(joined.after)).toBe(false);
    }
    await caretIn(scopeConditions(page));
    await page.keyboard.press('ControlOrMeta+Alt+Enter');
    const pageBreak = page.locator('.lab-pages hr[data-page-break]');
    await expect(pageBreak).toHaveCount(1);
    // Once the paragraph after the break has moved onto the next page.
    await expect(endsPage(page)).toHaveAttribute('data-page-break', 'manual');
    await page.keyboard.press('Backspace');
    await expect(pageBreak).toHaveClass(/ProseMirror-selectednode/);
    await page.keyboard.press('Backspace');
    await expect(pageBreak).toHaveCount(0);
  });

  test('DOCE-EDITING-2.6 starts a new page after the block, and selects only the body', async ({
    lab,
    page,
  }) => {
    await lab.open('editing');
    await caretIn(scopeConditions(page));
    await page.keyboard.press('ControlOrMeta+Alt+Enter');
    await expect(page.locator('.lab-pages hr[data-page-break]')).toHaveCount(1);
    await expect(endsPage(page)).toHaveAttribute('data-page-break', 'manual');
    await page.keyboard.press('ControlOrMeta+a');
    const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '');
    expect(selected.startsWith('Scope')).toBe(true);
    expect(selected).toContain('Timing responses');
  });
});
