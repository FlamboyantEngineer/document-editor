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

// The rows of the lab's first table, as their cells' text: its two parts on the pages joined,
// without the header row repeated on the second.
const firstTable = (page: Page) =>
  content(page)
    .locator('table')
    .evaluateAll((tables) =>
      tables.slice(0, 2).flatMap((table, index) =>
        Array.from((table as HTMLTableElement).rows)
          .slice(index === 0 ? 0 : 1)
          .map((row) =>
            Array.from(row.cells)
              .map((each) => each.textContent)
              .join('|'),
          ),
      ),
    );

// The point in the document just inside the first occurrence of a text, scrolled into view.
async function pointAt(page: Page, value: string) {
  const point = await content(page).evaluate(async (element, text) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.textContent?.indexOf(text) ?? -1;
      if (at < 0) continue;
      node.parentElement?.scrollIntoView({ block: 'center' });
      // A page scrolled into view renders on the next frame.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
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

// Where a list opened at the caret sits: `below` its line, `above` it, or across it, with the
// boxes when it is not below so a failure shows them.
async function listPlacement(page: Page, list: ReturnType<Page['getByRole']>) {
  const box = await list.locator('xpath=..').boundingBox();
  const line = await page.evaluate(() => {
    const selection = document.getSelection();
    if (!selection?.rangeCount) return null;
    const { top, bottom } = selection.getRangeAt(0).getBoundingClientRect();
    return { top, bottom };
  });
  if (!box || !line) return 'not shown';
  if (box.y >= line.bottom) return 'below';
  const where = box.y + box.height <= line.top ? 'above' : 'across';
  return `${where}: list ${String(box.y)}+${String(box.height)}, line ${String(line.top)}-${String(line.bottom)}`;
}

// Opens the context menu with a secondary click inside a text.
async function openMenuAt(page: Page, value: string) {
  const point = await pointAt(page, value);
  await page.mouse.click(point.left + 2, point.y, { button: 'right' });
  await expect(menu(page)).toBeVisible();
}

test.describe('document editor lab', () => {
  test('DOCE-EDITOR-2.1 DOCE-EDITOR-1.4 edits the document on pages that follow the edits', async ({
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

  test('DOCE-EDITOR-2.1 measures a long word and a run of spaces as the pages wrap them', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    await heading(page, 'Timing').click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.insertText(`wide${' '.repeat(40)}${'x'.repeat(300)}`);
    await expect(editor(page)).toHaveAttribute('data-layout-state', 'settled');
    // The block's height on the pages and in the measuring view.
    const heights = () =>
      page.evaluate(() =>
        ['.de-document-editor__content', '.de-document-editor__measure'].map((scope) => {
          const block = Array.from(document.querySelectorAll(`${scope} p`)).find((each) =>
            each.textContent?.startsWith('wide '),
          );
          return block?.getBoundingClientRect().height ?? 0;
        }),
      );
    const [drawn = 0, measured] = await heights();
    expect(drawn).toBeGreaterThan(36);
    expect(measured).toBe(drawn);
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

  test('DOCE-LAYOUT-4.1 DOCE-LAYOUT-4.4 shows the web layout without page chrome, a document at its page width', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    const paged = await pages(page).first().boundingBox();
    await page.getByLabel('Web layout').check();
    await expect(editor(page)).toHaveAttribute('data-web-width', 'fill');
    const regions = page.locator(
      '.de-document-editor__content :is(.pm-page-header, .pm-page-footer)',
    );
    expect(
      await regions.evaluateAll((all) => all.map((region) => getComputedStyle(region).display)),
    ).not.toContain('flow-root');
    const filled = await pages(page).first().boundingBox();
    expect(filled?.width ?? 0).toBeGreaterThan(paged?.width ?? 0);
    await page.getByLabel('Web width').selectOption('page');
    await expect(editor(page)).toHaveAttribute('data-web-width', 'page');
    const shown = await pages(page).first().boundingBox();
    const content = await page
      .locator('.de-document-editor__content .pm-page-content')
      .first()
      .boundingBox();
    expect(shown?.width).toBeCloseTo(paged?.width ?? 0, 0);
    expect(content?.x).toBeCloseTo(shown?.x ?? 0, 0);
    expect(content?.width).toBeCloseTo(shown?.width ?? 0, 0);
  });

  test("DOCE-LAYOUT-4.5 shows each section as an endless page at its page width or the host's, inset by its margins", async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    const paged = await pages(page).first().boundingBox();
    const pagedContent = await page
      .locator('.de-document-editor__content .pm-page-content')
      .first()
      .boundingBox();
    await page.getByLabel('Web layout').check();
    await page.getByLabel('Web width').selectOption('sheet');
    await expect(editor(page)).toHaveAttribute('data-web-width', 'sheet');
    const sheet = pages(page).first();
    const shown = await sheet.boundingBox();
    const content = await page
      .locator('.de-document-editor__content .pm-page-content')
      .first()
      .boundingBox();
    expect(shown?.width).toBeCloseTo(paged?.width ?? 0, 0);
    expect((content?.x ?? 0) - (shown?.x ?? 0)).toBeCloseTo(
      (pagedContent?.x ?? 0) - (paged?.x ?? 0),
      0,
    );
    expect(content?.width).toBeCloseTo(pagedContent?.width ?? 0, 0);
    expect(shown?.height ?? 0).toBeGreaterThan(paged?.height ?? 0);
    expect(await sheet.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe('none');
    await page.getByLabel('Max width').selectOption('600px');
    await expect(editor(page)).toHaveAttribute('style', /--de-web-max-width: 600px/);
    const capped = await sheet.boundingBox();
    expect(capped?.width).toBeCloseTo(600, 0);
    expect((capped?.x ?? 0) + (capped?.width ?? 0) / 2).toBeCloseTo(
      (shown?.x ?? 0) + (shown?.width ?? 0) / 2,
      0,
    );
    await page.getByLabel('Max width').selectOption('');
    await page.setViewportSize({ width: Math.round((paged?.width ?? 0) * 0.75), height: 800 });
    const narrow = await sheet.boundingBox();
    const narrowContent = await page
      .locator('.de-document-editor__content .pm-page-content')
      .first()
      .boundingBox();
    expect(narrow?.width ?? 0).toBeLessThan(shown?.width ?? 0);
    expect((narrowContent?.x ?? 0) - (narrow?.x ?? 0)).toBeCloseTo(
      (pagedContent?.x ?? 0) - (paged?.x ?? 0),
      0,
    );
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

  test('DOCE-EDITOR-3.1 keeps the context menu open and with its content as the document scrolls', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    await openMenuAt(page, 'Normal operation');
    const before = await menu(page).boundingBox();
    // The nearest scrolling ancestor of the document's content scrolls by 80 pixels.
    await content(page).evaluate((element) => {
      let at: Element | null = element;
      while (at && at.scrollHeight <= at.clientHeight) at = at.parentElement;
      (at ?? document.scrollingElement ?? document.documentElement).scrollBy(0, 80);
    });
    await expect(menu(page)).toBeVisible();
    await expect(async () => {
      const after = await menu(page).boundingBox();
      expect((before?.y ?? 0) - (after?.y ?? 0)).toBeCloseTo(80, -1);
    }).toPass();
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

  test('DOCE-EDITING-5.6 pastes without the formatting at the caret on Mod-Shift-v, and with it on Mod-v', async ({
    lab,
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await lab.open('document-editor');
    const point = await pointAt(page, 'Maintenance');
    await page.mouse.click(point.right, point.y);
    await page.keyboard.press('ControlOrMeta+b');
    await page.keyboard.type('Bold');
    await page.evaluate(() => navigator.clipboard.writeText('Kept'));
    await page.keyboard.press('ControlOrMeta+v');
    await page.evaluate(() => navigator.clipboard.writeText('Plain'));
    await page.keyboard.press('ControlOrMeta+Shift+v');
    const line = content(page).locator('li', { hasText: 'BoldKeptPlain' });
    await expect(line.locator('strong')).toHaveText('BoldKept');
  });

  test('DOCE-EDITOR-3.3 decides a suggestion and starts a comment from the menu', async ({
    lab,
    page,
  }) => {
    await lab.open('comments');
    await openMenuAt(page, 'every');
    await item(page, 'Accept suggestion').click();
    await expect(content(page)).toContainText('The log keeps each report');
    // The decision lays the pages out again; select once they have settled, so the drag lands.
    await expect(editor(page)).toHaveAttribute('data-layout-state', 'settled');
    await selectText(page, 'operator console');
    await expect
      .poll(() => page.evaluate(() => getSelection()?.toString()))
      .toBe('operator console');
    await openMenuAt(page, 'operator console');
    await item(page, 'Comment').click();
    // The right-click kept the selection, so the thread is on exactly the selected text.
    await expect(
      content(page).locator('mark[data-comment-id]', { hasText: 'operator console' }),
    ).toHaveText('operator console');
  });

  test('DOCE-EDITOR-3.3 comments on the whole selection when the menu opens outside it', async ({
    lab,
    page,
  }) => {
    await lab.open('comments');
    await expect(editor(page)).toHaveAttribute('data-layout-state', 'settled');
    // From "operator" in one paragraph to "keeps" in the next.
    const from = await pointAt(page, 'operator console');
    await page.mouse.click(from.left + 1, from.y);
    const to = await pointAt(page, 'The log keeps');
    await page.keyboard.down('Shift');
    await page.mouse.click(to.right - 1, to.y);
    await page.keyboard.up('Shift');
    await expect
      .poll(() => page.evaluate(() => getSelection()?.toString() ?? ''))
      .toMatch(/^operator console[\s\S]*The log keeps$/);
    await openMenuAt(page, 'ninety days');
    await item(page, 'Comment').click();
    // One thread, its marks on both paragraphs.
    const on = (text: string) =>
      content(page).locator('mark[data-comment-id]', { hasText: text }).last();
    await expect(on('operator console')).toHaveText(/^operator console/);
    await expect(on('The log keeps')).toHaveText(/The log keeps$/);
    const thread = await on('operator console').getAttribute('data-comment-id');
    await expect(on('The log keeps')).toHaveAttribute('data-comment-id', thread ?? '');
  });

  test('DOCE-EDITOR-3.3 starts a comment on the caret block from the menu without a selection', async ({
    lab,
    page,
  }) => {
    await lab.open('comments');
    await openMenuAt(page, 'ninety days');
    await expect(item(page, 'Comment')).toBeEnabled();
    await item(page, 'Comment').click();
    await expect(
      content(page).locator('mark[data-comment-id]', { hasText: 'ninety days' }),
    ).toHaveCount(1);
  });

  test('DOCE-EDITOR-3.4 adds a paragraph before a table from the menu', async ({ lab, page }) => {
    await lab.open('document-editor');
    await openMenuAt(page, 'Start');
    await item(page, 'Add paragraph before').click();
    await page.keyboard.type('Before the limits');
    const block = content(page).locator('p', { hasText: 'Before the limits' });
    await expect(block).toHaveCount(1);
    // The next block, on the same page or the next, is the table with its caption.
    const next = () =>
      content(page).evaluate((element) => {
        const blocks = Array.from(element.querySelectorAll('.pm-page-content > *'));
        const index = blocks.findIndex((each) => each.textContent === 'Before the limits');
        return blocks[index + 1]?.querySelector(':scope > table') ? 'TABLE' : null;
      });
    await expect.poll(next).toBe('TABLE');
  });

  test('DOCE-EDITOR-3.5 inserts and deletes table rows from the table entries', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    await openMenuAt(page, 'Start');
    await item(page, 'Insert row').hover();
    await item(page, 'Row below').click();
    await expect
      .poll(() => firstTable(page))
      .toEqual(['Condition|Limit', 'Start|25 ms', '|', 'Run|50 ms', 'Stop|75 ms']);
    await openMenuAt(page, 'Start');
    await expect(item(page, 'Merge cells')).toBeDisabled();
    await item(page, 'Delete').hover();
    await item(page, 'Delete row').click();
    await expect
      .poll(() => firstTable(page))
      .toEqual(['Condition|Limit', '|', 'Run|50 ms', 'Stop|75 ms']);
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

  test('DOCE-EDITOR-4.21 floats a toolbar over the selected text on pages', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    await page.getByLabel('Selection toolbar').check();
    const floating = page.getByRole('toolbar', { name: 'Selection formatting' });
    await selectText(page, 'Normal operation');
    await expect(floating).toBeVisible();
    // Above the selected text, and focus stays in the document.
    const point = await pointAt(page, 'Normal operation');
    const box = await floating.boundingBox();
    expect(box && box.y + box.height).toBeLessThanOrEqual(point.y);
    expect(box && Math.abs(box.x - point.left)).toBeLessThan(40);
    await expect(content(page)).toBeFocused();
    await floating.getByRole('button', { name: 'Italic' }).click();
    await expect(content(page).locator('em', { hasText: 'Normal operation' })).toHaveCount(1);
    await expect(content(page)).toBeFocused();
    await page.keyboard.press('Alt+F10');
    await expect(floating.getByRole('button', { name: 'Bold' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(floating).toBeHidden();
    await expect(content(page)).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(floating).toBeHidden();
  });

  test('DOCE-EDITOR-4.22 inserts from the menu a typed slash opens, on pages', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    await page.getByLabel('Slash menu').check();
    const point = await pointAt(page, 'Normal operation');
    await page.mouse.click(point.right + 2, point.y);
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    // The empty line shows the button that opens the menu.
    await expect(page.getByRole('button', { name: 'Insert block' })).toBeVisible();
    await page.keyboard.type('/');
    const list = page.getByRole('listbox', { name: 'Insert' });
    await expect(list).toBeVisible();
    await page.keyboard.type('head');
    await expect(list.getByRole('option').first()).toHaveText('Heading 1');
    // Below the slash once filtering shortens it enough to fit there, focus still in the
    // document. The unfiltered list may open above the slash, where it fits, and moves below a
    // frame after its options change. Measured against the slash's own line as it is now: the
    // pages may have moved it since the click.
    await expect.poll(() => listPlacement(page, list)).toBe('below');
    await expect(content(page)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(list).toBeHidden();
    await page.keyboard.type('Added heading');
    await expect(content(page).locator('h2', { hasText: 'Added heading' })).toHaveCount(1);
    await expect(content(page)).not.toContainText('/head');
  });

  test('DOCE-EDITOR-4.23 mentions a person found for a typed @, on pages', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    await page.getByLabel('Mentions').check();
    const point = await pointAt(page, 'Normal operation');
    await page.mouse.click(point.right + 2, point.y);
    await page.keyboard.press('End');
    await page.keyboard.type(' for @gra');
    const list = page.getByRole('listbox', { name: 'People' });
    await expect(list.getByRole('option')).toHaveCount(1);
    await expect(list.getByRole('option')).toContainText('Grace Hopper');
    await page.keyboard.press('Enter');
    await expect(list).toBeHidden();
    const mention = content(page).locator('[data-mention-user-id="grace"]');
    await expect(mention).toHaveText('@Grace Hopper');
    await page.keyboard.type('today');
    await expect(content(page)).toContainText('Normal operation for @Grace Hopper today');
  });

  test('DOCE-EDITOR-4.24 DOCE-EDITOR-4.25 DOCE-EDITOR-4.26 shows the writing helpers on pages', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    await page.getByLabel('Caret block').check();
    await page.getByLabel('Slash menu').check();
    // Where the text is, before the marks split it into runs.
    const point = await pointAt(page, 'Normal operation');
    await page.getByLabel('Formatting marks').check();
    await expect(editor(page)).toHaveAttribute('data-formatting-marks', 'true');
    await expect(content(page).locator('.de-formatting-space').first()).toBeVisible();
    await page.mouse.click(point.right + 2, point.y);
    await expect(content(page).locator('[data-caret-block]')).toHaveText('Normal operation');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    const hint = content(page).locator('.de-placeholder[data-placeholder-kind="line"]');
    await expect(hint).toHaveText('Type / to insert a block');
    await page.keyboard.type('Now text');
    await expect(hint).toHaveCount(0);
    // Turned off, the marks go.
    await page.getByLabel('Formatting marks').uncheck();
    await expect(content(page).locator('.de-formatting-space')).toHaveCount(0);
  });

  test('DOCE-EDITOR-4.2 DOCE-PAGINATION-7.1 scrolls the document in its frame below the toolbar, and lays it out again once remounted', async ({
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

  test('DOCE-EDITOR-5.1 reports the page, the words and the mode in the status bar', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    const status = page.getByRole('group', { name: 'Document status' });
    const pageItem = status.locator('.de-document-editor__status-item[data-status="page"]');
    const wordsItem = status.locator('.de-document-editor__status-item[data-status="words"]');
    const total = await pages(page).count();
    await expect(pageItem).toHaveText(`Page 1 of ${String(total)}`);
    const words = Number(
      /([\d,]+) words/.exec((await wordsItem.textContent()) ?? '')?.[1]?.replace(',', ''),
    );
    expect(words).toBeGreaterThan(100);
    await selectText(page, 'Normal operation');
    await expect(wordsItem).toContainText(/2 of [\d,]+ words/);
    const mode = status.locator('[data-status="mode"] > span');
    await expect(mode).toHaveText('Editing');
    await page.getByLabel('Authoring').uncheck();
    await expect(mode).toHaveText('Reading');
    await page.getByLabel('Status bar').uncheck();
    await expect(status).toHaveCount(0);
  });

  for (const layout of ['page', 'web'] as const) {
    test(`DOCE-EDITOR-4.12 keeps text selection while the document is read, in the ${layout} layout`, async ({
      lab,
      page,
    }) => {
      await lab.open('document-editor');
      if (layout === 'web') await page.getByLabel('Web layout').check();
      await page.getByLabel('Authoring').uncheck();
      await expect(editor(page)).toHaveAttribute('data-layout', layout);
      const selected = () => page.evaluate(() => document.getSelection()?.toString() ?? '');
      const before = await content(page).textContent();
      // A double click selects the word, and the selection stays.
      const point = await pointAt(page, 'Normal operation');
      await page.mouse.dblclick(point.left + 5, point.y);
      await expect.poll(selected).toBe('Normal');
      // Shift with an arrow extends it from the keyboard.
      await page.keyboard.press('Shift+ArrowRight');
      await expect.poll(selected).toBe('Normal ');
      // Typing changes nothing.
      await page.keyboard.type('x');
      await page.keyboard.press('Backspace');
      expect(await content(page).textContent()).toBe(before);
      // A drag selects too.
      await selectText(page, 'Normal operation');
      await expect.poll(selected).toBe('Normal operation');
    });
  }

  test('DOCE-EDITOR-5.4 reports the page in view as the reader scrolls, not the caret', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    const status = page.getByRole('group', { name: 'Document status' });
    const pageItem = status.locator('.de-document-editor__status-item[data-status="page"]');
    const total = await pages(page).count();
    expect(total).toBeGreaterThan(2);
    await heading(page, 'Scope').click();
    await expect(pageItem).toHaveText(`Page 1 of ${String(total)}`);
    const viewport = page.locator('.de-document-editor__viewport .ui-scroll-region__viewport');
    await viewport.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(pageItem).toHaveText(`Page ${String(total)} of ${String(total)}`);
    // The caret stays on the first page while the last one is in view.
    await viewport.evaluate((element) => {
      element.scrollTop = 0;
    });
    await expect(pageItem).toHaveText(`Page 1 of ${String(total)}`);
    // Without its frame the editor scrolls with the page, and the status still follows it.
    await page.getByLabel('Scrolling frame').uncheck();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(pageItem).toHaveText(`Page ${String(total)} of ${String(total)}`);
  });

  test('DOCE-EDITOR-5.5 shows the host arrangement of the status bar', async ({ lab, page }) => {
    await lab.open('document-editor');
    const status = page.getByRole('group', { name: 'Document status' });
    const end = status.locator('.de-document-editor__status-end');
    await expect(end.locator('[data-status="workflow"]')).toHaveText('Draft');
    await expect(end.locator('[data-status="mode"]')).toHaveText('Editing');
    await page.getByLabel('Host items').uncheck();
    await expect(status.locator('[data-status="workflow"]')).toHaveCount(0);
    await expect(
      status.locator('.de-document-editor__status-start [data-status="mode"]'),
    ).toHaveText('Editing');
  });

  test('DOCE-EDITOR-6.20 tells the host the elements on screen', async ({ lab, page }) => {
    await lab.open('document-editor');
    const report = page.getByRole('status', { name: 'Host report' });
    const onScreen = async () =>
      Number(/(\d+) elements on screen/.exec((await report.textContent()) ?? '')?.[1] ?? 0);
    // The lead and the contents fill the first screen; the first chapter shows below them.
    const viewport = page.locator('.de-document-editor__viewport .ui-scroll-region__viewport');
    await viewport.evaluate((element) => {
      element.scrollTop = 600;
    });
    await expect.poll(onScreen).toBeGreaterThan(5);
    // The host learns where the first page's content ends, to draw in the margin beside it.
    await expect(report).toContainText(/right margin [1-9]\d* px/);
  });

  test('DOCE-EDITOR-7.1 DOCE-EDITOR-7.4 shows the host banner once a press ends and dismisses it', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    const target = heading(page, 'Scope');
    await target.scrollIntoViewIfNeeded();
    const notices = page.getByRole('region', { name: 'Document notices' });
    await expect(notices).toHaveCount(0);
    const box = await target.boundingBox();
    if (!box) throw new Error('The heading should show.');
    await page.mouse.move(box.x + 4, box.y + box.height / 2);
    await page.mouse.down();
    // The host adds its banner while the reader still presses in the document.
    await page.getByLabel('Banner').evaluate((input) => (input as HTMLInputElement).click());
    await expect(page.getByLabel('Banner')).toBeChecked();
    await expect(notices).toHaveCount(0);
    await page.mouse.up();
    const banner = notices.locator('[data-banner="review"]');
    await expect(banner).toContainText('In review');
    await banner.getByRole('button', { name: /dismiss/i }).click();
    await expect(notices).toHaveCount(0);
    await expect(page.getByLabel('Banner')).not.toBeChecked();
  });

  test('DOCE-EDITOR-4.28 keeps the selection drawn while a host field has focus', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    await selectText(page, 'Normal operation');
    // The document has taken the selection once the status bar counts its words.
    const status = page.getByRole('group', { name: 'Document status' });
    await expect(status.locator('[data-status="words"]')).toContainText(/2 of [\d,]+ words/);
    const held = page.locator('.de-held-selection');
    await expect(held).toHaveCount(0);
    await page.getByLabel('Prompt').click();
    await expect(held.first()).toBeVisible();
    await expect(held.first()).toHaveText('Normal operation');
    await held.first().click();
    await expect(held).toHaveCount(0);
  });

  test('DOCE-EDITOR-7.5 floats the banners over the document without moving it', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    const target = heading(page, 'Scope');
    await target.scrollIntoViewIfNeeded();
    const before = await target.boundingBox();
    // Clicked in place, so the page does not scroll to the control.
    const toggle = () =>
      page.getByLabel('Banner').evaluate((input) => (input as HTMLInputElement).click());
    await toggle();
    const notices = page.getByRole('region', { name: 'Document notices' });
    await expect(notices.locator('[data-banner="review"]')).toContainText('In review');
    expect(await target.boundingBox()).toEqual(before);
    const center = page.locator('.de-document-editor__center');
    const [region, column] = await Promise.all([notices.boundingBox(), center.boundingBox()]);
    if (!region || !column) throw new Error('The banners and the document should show.');
    expect(region.y).toBeGreaterThanOrEqual(column.y);
    expect(region.height).toBeLessThanOrEqual(column.height / 2 + 1);
    await toggle();
    await expect(notices).toHaveCount(0);
    expect(await target.boundingBox()).toEqual(before);
  });

  test('DOCE-EDITOR-4.18 DOCE-EDITOR-4.19 shows the lead, then the pages, with the overview beside the native scrollbar', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    const viewport = page.locator('.de-document-editor__viewport');
    await expect(viewport.locator('.de-document-editor__lead')).toHaveText(
      'Sample document · draft',
    );
    await expect(page.locator('.de-document-editor__placeholder')).toHaveCount(0);
    await expect(pages(page).first()).toBeVisible();
    const overview = page.locator('.de-document-editor .ui-scroll-region__overview');
    await expect(overview).toHaveCount(1);
    // The frame keeps its native scrollbar: the overview is painted beside it, with no control.
    await expect(page.locator('.de-document-editor .ui-scroll-region')).toHaveAttribute(
      'data-scrollbar',
      'native',
    );
    await expect(page.locator('.de-document-editor .ui-scroll-region__overview')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    // The word-list proofer's issues are marked on the overview's track.
    await expect(page.locator('[data-proofing-issue]').first()).toBeAttached();
    await expect
      .poll(() =>
        overview.evaluate((element) =>
          [element, ...element.querySelectorAll('*')].some((each) =>
            getComputedStyle(each).backgroundImage.includes('gradient'),
          ),
        ),
      )
      .toBe(true);
    await page.getByLabel('Scrolling frame').uncheck();
    await expect(overview).toHaveCount(0);
    await expect(page.locator('.de-document-editor__lead')).toBeVisible();
  });

  test('DOCE-EDITOR-4.3 DOCE-EDITOR-4.4 adds the host items, controls and arrangement to the toolbar', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    const toolbar = page.getByRole('toolbar', { name: 'Formatting' });
    await expect(toolbar.locator('[data-group="marks"] [data-item="strikethrough"]')).toHaveCount(
      0,
    );
    await expect(toolbar.locator('[data-group="marks"] [data-item="bold"]')).toHaveCount(1);
    const saved = page.locator('.de-document-editor__toolbar-end');
    await expect(saved).toHaveText('Saved');
    const insert = toolbar.locator('[data-group="insert"] [data-item="insert-date"]');
    await expect(insert).toHaveText('Insert date');
    await heading(page, 'Timing').click();
    await page.keyboard.press('End');
    // A typed key settles the caret in the document before the button reads it.
    await page.keyboard.type(' ');
    await expect
      .poll(() => heading(page, 'Timing').evaluate((element) => element.textContent?.endsWith(' ')))
      .toBe(true);
    await insert.click();
    await expect(heading(page, 'Timing')).toContainText(/Timing \d{4}-\d{2}-\d{2}/);
    await expect(saved).toHaveText('Edited');
    await page.getByLabel('Host items').uncheck();
    await expect(toolbar.locator('[data-item="strikethrough"]')).toHaveCount(1);
    await expect(toolbar.locator('[data-item="insert-date"]')).toHaveCount(0);
    await expect(saved).toHaveCount(0);
  });

  test('DOCE-EDITOR-3.6 adds the host entries for what the menu opens on', async ({
    lab,
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await lab.open('document-editor');
    await heading(page, 'Timing').click({ button: 'right' });
    const entries = menu(page).getByRole('menuitem');
    await expect(entries.first()).toHaveText('Copy link to heading');
    await entries.first().click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toMatch(/^#[A-Za-z0-9_-]+$/);
    await openMenuAt(page, 'Start');
    await expect(item(page, 'Row 2, column 1')).toBeDisabled();
    await page.keyboard.press('Escape');
    await openMenuAt(page, 'Normal operation');
    await expect(item(page, 'Copy link to heading')).toHaveCount(0);
  });

  test('DOCE-EDITOR-3.7 offers no changes at a locked position and refuses typing there', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    await openMenuAt(page, 'workflow state');
    await expect(item(page, /^Copy/)).toBeVisible();
    await expect(item(page, /^Paste as plain text/)).toBeDisabled();
    await expect(item(page, 'Clear formatting')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.keyboard.type('xyz');
    await expect(content(page)).toContainText('Locked by its workflow state: this paragraph');
    await expect(content(page)).not.toContainText('xyz');
    const bold = page
      .getByRole('toolbar', { name: 'Formatting' })
      .getByRole('button', { name: 'Bold' });
    await expect(bold).toBeDisabled();
    await heading(page, 'Timing').click();
    await expect(bold).toBeEnabled();
  });

  test('DOCE-EDITOR-6.1 DOCE-EDITOR-6.2 DOCE-EDITOR-6.3 tells the host, runs its keys and takes its handle', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    const host = page.getByRole('status', { name: 'Host report' });
    await expect(host).toContainText('Not focused · 0 changes');
    await heading(page, 'Timing').click();
    await expect(host).toContainText('Focused');
    await expect(host).toContainText('caret in heading');
    await page.keyboard.press('End');
    await page.keyboard.type('!');
    await expect(host).toContainText('1 changes');
    await page.keyboard.press('ControlOrMeta+s');
    await expect(host).toContainText('saved 1 times');
    await page.getByRole('button', { name: 'Go to Power' }).click();
    await expect(content(page)).toBeFocused();
    const caret = await page.evaluate(() => document.getSelection()?.anchorNode?.textContent);
    expect(caret).toBe('Power');
  });

  test('DOCE-EDITOR-6.2 binds the keys of the host remapping the shortcut table', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    await selectText(page, 'Normal operation');
    await page.keyboard.press('ControlOrMeta+Shift+x');
    await expect(content(page).locator('s')).toContainText('ormal operatio');
    await page.keyboard.press('ControlOrMeta+b');
    await expect(content(page).locator('s strong, strong s')).toContainText('ormal operatio');
  });

  test('DOCE-EDITOR-6.4 zooms the pages from the status bar and with Ctrl+wheel', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    const zoomOf = () =>
      content(page).evaluate((element) => getComputedStyle(element).getPropertyValue('zoom'));
    expect(await zoomOf()).toBe('1');
    const zoom = page.getByRole('group', { name: 'Zoom' });
    await zoom.getByRole('button', { name: /Zoom in/i }).click();
    await expect.poll(zoomOf).toBe('1.25');
    await content(page).hover();
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, 100);
    await page.keyboard.up('Control');
    await expect.poll(zoomOf).toBe('1');
  });

  test('DOCE-EDITOR-6.5 shows suggestions with all markup, simple, none or as before', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    await page.getByRole('button', { name: 'Rewrite a phrase' }).click();
    const inserted = content(page).locator('ins', { hasText: 'operating state' });
    const deleted = content(page).locator('del', { hasText: 'condition' }).first();
    await expect(inserted).toBeVisible();
    await expect(deleted).toBeVisible();
    await page.getByLabel('Markup').selectOption('final');
    await expect(editor(page)).toHaveAttribute('data-markup', 'final');
    await expect(deleted).toBeHidden();
    await expect(inserted).toBeVisible();
    await page.getByLabel('Markup').selectOption('original');
    await expect(inserted).toBeHidden();
    await expect(deleted).toBeVisible();
  });

  test('DOCE-EDITOR-6.5 DOCE-VERSIONS-2.4 bars each line a suggestion shows on in the simple markup', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    await page.getByRole('button', { name: 'Rewrite a phrase' }).click();
    await page.getByLabel('Markup').selectOption('simple');
    const bars = content(page).locator('.de-change-lines__line[data-diff-line="suggestion"]');
    await expect(bars.first()).toBeAttached();
    // Each line holding suggested text has a bar on it, and each bar is on such a line.
    const placed = await content(page).evaluate((root) => {
      const middles = [...root.querySelectorAll('ins[data-id]')].flatMap((element) =>
        [...element.getClientRects()].map((box) => (box.top + box.bottom) / 2),
      );
      const bands = [...root.querySelectorAll('.de-change-lines__line')].map((bar) => {
        const box = bar.getBoundingClientRect();
        return { top: box.top, bottom: box.bottom };
      });
      return {
        unbarred: middles.filter((y) => !bands.some((band) => y >= band.top && y <= band.bottom)),
        empty: bands.filter((band) => !middles.some((y) => y >= band.top && y <= band.bottom))
          .length,
        blockShadows: [...root.querySelectorAll('.pm-page-content > *')].filter(
          (block) => getComputedStyle(block).boxShadow !== 'none',
        ).length,
      };
    });
    expect(placed.unbarred).toEqual([]);
    expect(placed.empty).toBe(0);
    expect(placed.blockShadows).toBe(0);
    await page.getByLabel('Markup').selectOption('all');
    await expect(bars).toHaveCount(0);
  });

  test('DOCE-EDITOR-6.11 tells the host the bars the simple markup draws', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    const report = page.getByRole('status', { name: 'Host report' });
    await page.getByRole('button', { name: 'Rewrite a phrase' }).click();
    await expect(report).not.toContainText('change bars');
    await page.getByLabel('Markup').selectOption('simple');
    await expect(report).toContainText(/[1-9]\d* change bars/);
    await page.getByLabel('Markup').selectOption('all');
    await expect(report).not.toContainText('change bars');
  });

  test('DOCE-EDITOR-6.6 DOCE-EDITOR-6.32 reports its first layout and what its layouts did to the host telemetry', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    const report = page.getByRole('status', { name: 'Host report' });
    await expect(report).toContainText(/first layout \d+ ms/);
    await expect(report).toContainText(/[1-9]\d* blocks measured/);
    // The load trace: the pages' mount and the layouts that opened the document.
    await expect(report).toContainText(/pages mounted in \d+ ms/);
    await expect(report).toContainText(/opened in [1-9]\d* layouts/);
  });

  test('DOCE-EDITOR-6.12 publishes its layout state, pending after an edit until it settles', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    await expect(editor(page)).toHaveAttribute('data-layout-state', 'settled');
    const before = await pages(page).count();
    await heading(page, 'Power').click();
    await page.keyboard.press('End');
    // The states the root goes through from here on.
    await page.evaluate(() => {
      const root = document.querySelector('.de-document-editor');
      const seen: string[] = [];
      Object.assign(window, { layoutStates: seen });
      if (!root) return;
      new MutationObserver(() => {
        seen.push(root.getAttribute('data-layout-state') ?? '');
      }).observe(root, { attributeFilter: ['data-layout-state'] });
    });
    for (let line = 0; line < 30; line += 1) await page.keyboard.press('Enter');
    await expect(editor(page)).toHaveAttribute('data-layout-state', 'settled');
    await expect.poll(() => pages(page).count()).toBeGreaterThan(before);
    const seen = await page.evaluate(
      () => (window as unknown as { layoutStates: string[] }).layoutStates,
    );
    expect(seen).toContain('pending');
    expect(seen.at(-1)).toBe('settled');
    await page.getByLabel('Web layout').check();
    await expect(editor(page)).toHaveAttribute('data-layout-state', 'settled');
  });

  test('DOCE-EDITOR-6.7 DOCE-EDITOR-6.8 tells the host it is ready and leaves checks to the host', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    await expect(page.getByRole('status', { name: 'Host report' })).toContainText('ready');
    await expect(content(page)).toHaveAttribute('spellcheck', 'false');
    const containment = await page
      .locator('.de-document-editor__content .pm-page')
      .first()
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return `${style.contain}|${style.contentVisibility}`;
      });
    expect(containment).not.toMatch(/style|auto/);
  });

  test('DOCE-EDITOR-5.3 goes to a page from the status bar and switches the layout', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    // Going to a page scrolls the editor's own frame, not every area around it as
    // scrollIntoView would.
    await page.evaluate(() => {
      const calls = { intoView: 0 };
      Object.assign(window, { calls });
      const original = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (this: Element, ...args) {
        if (this.classList.contains('pm-page')) calls.intoView += 1;
        original.apply(this, args);
      };
    });
    const status = page.getByRole('group', { name: 'Document status' });
    await status.getByRole('button', { name: /Page 1 of/ }).click();
    const field = page.getByRole('textbox', { name: 'Go to page' });
    await field.fill('3');
    await field.press('Enter');
    await expect
      .poll(() =>
        pages(page)
          .nth(2)
          .evaluate((element) => {
            const viewport =
              element.closest('.ui-scroll-region__viewport') ?? document.documentElement;
            return Math.abs(
              element.getBoundingClientRect().top - viewport.getBoundingClientRect().top,
            );
          }),
      )
      .toBeLessThan(80);
    expect(
      await page.evaluate(() => (window as unknown as { calls: { intoView: number } }).calls),
    ).toEqual({ intoView: 0 });
    await status.getByRole('button', { name: 'Web view' }).click();
    await expect(editor(page)).toHaveAttribute('data-layout', 'web');
    await status.getByRole('button', { name: 'Page view' }).click();
    await expect(editor(page)).toHaveAttribute('data-layout', 'page');
  });

  test('DOCE-EDITOR-5.3 cancels going to a page on Escape, which stops at the field', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    const viewport = page.locator('.de-document-editor .ui-scroll-region__viewport').first();
    const before = await viewport.evaluate((element) => element.scrollTop);
    await page.evaluate(() => {
      const seen = { escapes: 0 };
      Object.assign(window, { seen });
      window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') seen.escapes += 1;
      });
    });
    const status = page.getByRole('group', { name: 'Document status' });
    await status.getByRole('button', { name: /Page 1 of/ }).click();
    const field = page.getByRole('textbox', { name: 'Go to page' });
    await field.fill('3');
    await field.press('Escape');
    await expect(field).toHaveCount(0);
    // Closing the field by Escape commits nothing as it loses focus.
    await page.waitForTimeout(600);
    expect(await viewport.evaluate((element) => element.scrollTop)).toBe(before);
    expect(
      await page.evaluate(() => (window as unknown as { seen: { escapes: number } }).seen.escapes),
    ).toBe(0);
  });

  test('DOCE-PAGINATION-7.4 shows what each page takes of its height while debugging', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    await expect(pages(page).first()).not.toHaveAttribute('data-debug-used');
    await page.getByLabel('Layout debugging').check();
    await expect(editor(page)).toHaveAttribute('data-debug', 'true');
    const first = pages(page).first();
    await expect(first).toHaveAttribute('data-debug-used', /^\d+\.\d{3}$/);
    const used = Number(await first.getAttribute('data-debug-used'));
    const free = Number(await first.getAttribute('data-debug-free'));
    expect(used).toBeGreaterThan(100);
    expect(free).toBeGreaterThanOrEqual(0);
    await page.getByLabel('Layout debugging').uncheck();
    await expect(first).not.toHaveAttribute('data-debug-used');
  });

  test('DOCE-PAGINATION-7.4 DOCE-EDITOR-6.13 shows each block height and the measuring view', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    const block = content(page).locator('.pm-page-content > *').first();
    await expect(block).not.toHaveAttribute('data-debug-height');
    await page.getByLabel('Block heights').check();
    await expect(editor(page)).toHaveAttribute('data-debug-blocks', 'true');
    await expect(block).toHaveAttribute('data-debug-height', /^\d+\.\d{3}$/);
    const height = Number(await block.getAttribute('data-debug-height'));
    const box = await block.boundingBox();
    expect(Math.abs(height - (box?.height ?? 0))).toBeLessThanOrEqual(1);
    await page.getByLabel('Block heights').uncheck();
    await expect(block).not.toHaveAttribute('data-debug-height');

    const measure = page.locator('.de-document-editor__measure');
    await expect(measure).not.toBeInViewport();
    await page.getByLabel('Measuring view').check();
    await expect(editor(page)).toHaveAttribute('data-debug-measure', 'true');
    await expect(measure).toBeInViewport();
  });

  test('DOCE-PAGINATION-7.4 DOCE-EDITOR-6.13 labels each page with its sheet and outlines its regions', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    await page.getByLabel('Layout debugging').check();
    await page.getByLabel('Block heights').check();
    const first = pages(page).first();
    await expect(first).toHaveAttribute('data-debug-paper', /^\d+\.\d{3} × \d+\.\d{3}$/);
    await expect(first).toHaveAttribute('data-debug-content', /^\d+\.\d{3} × \d+\.\d{3}$/);
    await expect(first).toHaveAttribute('data-debug-dpr', /^\d+\.\d{3}$/);
    const label = await first.evaluate((element) => getComputedStyle(element, '::after').content);
    expect(label).toContain('paper');
    const region = first.locator(':scope > [data-debug-type="page_content"]');
    await expect(region).toHaveCSS('outline-style', 'dashed');
    await expect(first).toHaveCSS('outline-style', 'none');
  });

  test('DOCE-EDITOR-6.31 shows a hovered block its type, sizes and place', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    await page.getByLabel('Block heights').check();
    const block = content(page).locator('.pm-page-content > [data-debug-type]').first();
    await block.scrollIntoViewIfNeeded();
    await block.hover({ position: { x: 4, y: 4 } });
    const tip = page.getByRole('tooltip');
    await expect(tip).toBeVisible();
    await expect(tip).toContainText(/\d+\.\d{3} × \d+\.\d{3}/);
    await expect(tip).toContainText('With margins');
    const type = await block.getAttribute('data-debug-type');
    await expect(tip).toContainText(type ?? '');
    await expect(async () => {
      const [tipBox, blockBox] = [await tip.boundingBox(), await block.boundingBox()];
      expect(
        Math.abs(
          (tipBox?.x ?? 0) + (tipBox?.width ?? 0) - ((blockBox?.x ?? 0) + (blockBox?.width ?? 0)),
        ),
      ).toBeLessThanOrEqual(2);
    }).toPass();
    await page.getByRole('button', { name: 'Bold' }).hover();
    await expect(tip).toBeHidden();
  });

  test("DOCE-EDITOR-6.31 DOCE-PAGINATION-7.4 outlines a page's footnote area and shows its sizes on hover", async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    await page.getByLabel('Block heights').check();
    const paragraph = content(page).locator('p', { hasText: 'Each requirement' }).first();
    await paragraph.scrollIntoViewIfNeeded();
    await paragraph.click();
    await page.keyboard.press('End');
    await page.getByRole('button', { name: 'Footnote' }).click();
    await page.keyboard.type('Measured at start-up.');
    const area = content(page).locator('.pm-page > [data-debug-type]', {
      has: page.locator('.pm-footnote-entry', { hasText: 'Measured at start-up.' }),
    });
    await expect(area).toHaveCount(1);
    await expect(area).toHaveCSS('outline-style', 'dashed');
    const type = (await area.getAttribute('data-debug-type')) ?? '';
    expect(type).toMatch(/footnote/);
    await area.hover({ position: { x: 4, y: 2 } });
    const tip = page.getByRole('tooltip');
    await expect(tip).toBeVisible();
    await expect(tip).toContainText(type);
    await expect(tip).toContainText(/\d+\.\d{3} × \d+\.\d{3}/);
  });

  test('DOCE-EDITOR-6.29 DOCE-EDITOR-6.30 shows the measuring view and the markup in a resizable pane', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    await content(page).locator('.pm-page-content p').first().click();
    await page.keyboard.press('Control+Alt+b');
    await expect(page.getByLabel('Block heights')).toBeChecked();
    await page.keyboard.press('Control+Alt+b');
    await expect(page.getByLabel('Measuring view')).toBeChecked();
    const pane = page.getByRole('region', { name: 'Layout debugging' });
    await expect(pane.locator('.de-document-editor__measure')).toBeInViewport();
    const handle = page.getByRole('separator', { name: 'Resize the layout debugging' });
    const before = (await pane.boundingBox())?.width ?? 0;
    const grip = await handle.boundingBox();
    if (!grip) throw new Error('no resize handle');
    await page.mouse.move(grip.x + grip.width / 2, grip.y + 40);
    await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2 - 80, grip.y + 40, { steps: 4 });
    await page.mouse.up();
    await expect(async () => {
      expect((await pane.boundingBox())?.width ?? 0).toBeGreaterThan(before + 40);
    }).toPass();
    await content(page).locator('.pm-page-content p').first().click();
    await page.keyboard.press('Control+Alt+b');
    await expect(page.getByLabel('Page source')).toBeChecked();
    await expect(pane).toHaveAttribute('data-view', 'source');
    await expect(pane).toContainText('pm-page-content');
    await page.keyboard.press('Control+Alt+b');
    await expect(pane).toBeHidden();
  });
});
