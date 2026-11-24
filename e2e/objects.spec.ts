import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const content = (page: Page) => page.locator('.de-document-editor__content');
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Formatting' });
const dialog = (page: Page) => page.getByRole('dialog');
const item = (page: Page, name: string | RegExp) =>
  page.getByRole('menu').last().getByRole('menuitem', { name });
const choice = (page: Page, name: string) =>
  page.getByRole('menu').last().getByRole('menuitemcheckbox', { name });

// Types a new paragraph after the heading, leaving the caret at its end.
async function newParagraph(page: Page, heading: string, value: string) {
  await content(page).locator('h1', { hasText: heading }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type(value);
}

// Inserts the lab's wide panel image after the heading, through the image picker, with a caption.
async function insertWidePanel(page: Page, caption: string) {
  await newParagraph(page, 'Power', '');
  await toolbar(page).getByRole('button', { name: 'Figure' }).click();
  await item(page, 'Image…').click();
  await dialog(page).getByRole('button', { name: 'Choose an image…' }).click();
  const picker = page.getByRole('group', { name: 'Choose an image…' });
  await picker.getByRole('searchbox').fill('wide');
  const row = picker.getByRole('row', { name: 'Wide panel' });
  await row.click();
  // The picker draws its list again for the choice; Insert is pressed once that settles.
  await expect(row).toHaveAttribute('aria-selected', 'true');
  await picker.getByRole('button', { name: 'Insert' }).click();
  // The picker closes on its own Insert; under load its fade can outlast the next few steps.
  await expect(picker).toHaveCount(0);
  await expect(dialog(page).getByRole('figure', { name: 'Preview' })).toHaveAttribute(
    'data-state',
    'ready',
  );
  await dialog(page).getByRole('textbox', { name: 'Caption' }).fill(caption);
  await dialog(page).getByRole('button', { name: 'Insert' }).click();
  return content(page).locator('figure[data-file-asset-id="library-wide"]');
}

test.describe('objects', () => {
  test.beforeEach(async ({ lab }) => {
    await lab.open('full-editor');
  });

  test('DOCE-EDITOR-4.5 inserts a footnote and its entry, and DOCE-EDITOR-3.8 deletes it', async ({
    page,
  }) => {
    await newParagraph(page, 'Power', 'Drift is small');
    await toolbar(page).getByRole('button', { name: 'Footnote' }).click();
    await page.keyboard.type('Measured at start-up.');
    const entry = content(page).locator('.pm-footnote-entry', { hasText: 'Measured at start-up.' });
    await expect(entry).toHaveCount(1);
    const marker = content(page)
      .locator('p', { hasText: 'Drift is small' })
      .locator('.footnote-reference');
    await expect(marker).toHaveCount(1);
    // In its entry, the menu goes to the marker; on the marker, it deletes the footnote.
    await entry.click({ button: 'right' });
    await item(page, 'Go to footnote reference').click();
    await marker.click({ button: 'right' });
    await item(page, 'Delete footnote').click();
    await expect(entry).toHaveCount(0);
    await expect(marker).toHaveCount(0);
  });

  test('DOCE-FOOTNOTES-1.2 cites a footnote from a table cell', async ({ page }) => {
    const cell = content(page).locator('.doc-table-figure td', { hasText: 'Start' }).first();
    await cell.click();
    await page.keyboard.press('End');
    const button = toolbar(page).getByRole('button', { name: 'Footnote' });
    await expect(button).toBeEnabled();
    await button.click();
    await page.keyboard.type('From the cell.');
    await expect(
      content(page).locator('.pm-footnote-entry', { hasText: 'From the cell.' }),
    ).toHaveCount(1);
    await expect(cell.locator('.footnote-reference')).toHaveCount(1);
  });

  test('DOCE-FOOTNOTES-1.2 cites a footnote from a figure caption', async ({ page }) => {
    const figure = await insertWidePanel(page, 'The panel');
    const caption = figure.locator('[data-doc-caption-text]');
    await caption.click();
    await page.keyboard.press('End');
    const button = toolbar(page).getByRole('button', { name: 'Footnote' });
    await expect(button).toBeEnabled();
    await button.click();
    await page.keyboard.type('From the caption.');
    await expect(
      content(page).locator('.pm-footnote-entry', { hasText: 'From the caption.' }),
    ).toHaveCount(1);
    await expect(caption.locator('.footnote-reference')).toHaveCount(1);
  });

  test('DOCE-FOOTNOTES-1.3 DOCE-FOOTNOTES-1.4 deletes a footnote with Backspace after or on its marker and Delete before it', async ({
    page,
  }) => {
    await newParagraph(page, 'Power', 'Drift is small');
    await toolbar(page).getByRole('button', { name: 'Footnote' }).click();
    await page.keyboard.type('Measured at start-up.');
    const entry = content(page).locator('.pm-footnote-entry', { hasText: 'Measured at start-up.' });
    const marker = content(page)
      .locator('p', { hasText: 'Drift is small' })
      .locator('.footnote-reference');
    const toMarker = async () => {
      await entry.click({ button: 'right' });
      await item(page, 'Go to footnote reference').click();
    };
    // Backspace after the marker deletes it, and its entry with it.
    await toMarker();
    await page.keyboard.press('Backspace');
    await expect(marker).toHaveCount(0);
    await expect(entry).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+Z');
    await expect(marker).toHaveCount(1);
    await expect(entry).toHaveCount(1);
    // The marker selected, Backspace deletes it; before the marker, Delete does.
    await toMarker();
    await page.keyboard.press('ArrowLeft');
    await expect(marker).toHaveClass(/ProseMirror-selectednode/);
    await page.keyboard.press('Backspace');
    await expect(marker).toHaveCount(0);
    await expect(entry).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+Z');
    await expect(entry).toHaveCount(1);
    await toMarker();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Delete');
    await expect(marker).toHaveCount(0);
    await expect(entry).toHaveCount(0);
    await expect(content(page).locator('p', { hasText: 'Drift is small' })).toHaveCount(1);
  });

  test('DOCE-FOOTNOTES-1.1 keeps a footnote entry one run of text, and keeps it when emptied', async ({
    page,
  }) => {
    await newParagraph(page, 'Power', 'Drift is small');
    await toolbar(page).getByRole('button', { name: 'Footnote' }).click();
    await page.keyboard.type('Measured');
    const entries = content(page).locator('.pm-footnote-entry');
    const count = await entries.count();
    const entry = entries.filter({ hasText: 'Measured' });
    // Block objects are not offered in an entry; inline formatting is.
    await expect(toolbar(page).getByRole('button', { name: 'Insert table' })).toBeDisabled();
    await page.keyboard.press('ControlOrMeta+B');
    await page.keyboard.type(' hot');
    await expect(entry.locator('strong')).toHaveText(' hot');
    // Enter adds nothing, and clearing the text keeps the entry.
    await page.keyboard.press('Enter');
    await page.keyboard.press('Shift+Enter');
    await expect(entry.locator('p, br:not(.ProseMirror-trailingBreak)')).toHaveCount(0);
    await expect(entry).toHaveText(/Measured hot$/);
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Backspace');
    await expect(entries).toHaveCount(count);
    await expect(
      content(page).locator('p', { hasText: 'Drift is small' }).locator('.footnote-reference'),
    ).toHaveCount(1);
  });

  test('DOCE-FOOTNOTES-1.1 DOCE-PAGINATION-7.2 lays a footnote inserted on a full page out at once, apart from the text', async ({
    page,
  }) => {
    const pages = content(page).locator('.pm-page');
    // A full page: one ending with a paragraph, the room left under its text less than the area's
    // spacing above an entry (the template's 12pt), so an entry's line no longer fits beside it.
    let full = -1;
    for (let at = 0; full < 0 && at < (await pages.count()); at += 1) {
      const blocks = pages.nth(at).locator('.pm-page-content > *');
      await blocks.last().scrollIntoViewIfNeeded();
      // The page is drawn on the engine's lines once near the screen.
      await expect(pages.nth(at).locator('.de-forced-lines').first()).toBeAttached();
      const room = await pages.nth(at).evaluate((element) => {
        const body = element.querySelector('.pm-page-content');
        const children = [...(body?.children ?? [])];
        const ends = children.map((child) => child.getBoundingClientRect().bottom);
        const free = (body?.getBoundingClientRect().bottom ?? 0) - Math.max(...ends);
        return { free, paragraph: children.at(-1)?.tagName === 'P' };
      });
      if (room.paragraph && room.free < 16) full = at;
    }
    expect(full).toBeGreaterThanOrEqual(0);
    const last = pages.nth(full).locator('.pm-page-content > p').last();
    const text = (await last.textContent()) ?? '';
    await last.click();
    await page.keyboard.press('End');
    const area = pages.nth(full).locator('.pm-page-footnotes');
    const height = (region: typeof area) =>
      region.evaluate((element) => element.getBoundingClientRect().height);
    await expect.poll(() => height(area)).toBe(0);
    await toolbar(page).getByRole('button', { name: 'Footnote' }).click();
    // Before anything is typed, the marker's page holds the entry, its text ending above it: the
    // block that no longer fits with the entry moves on, here to the next page.
    const marker = content(page)
      .locator('p', { hasText: text.trim() })
      .locator('.footnote-reference');
    await expect(marker).toHaveCount(1);
    const index = await marker.evaluate((element) => {
      const all = [...document.querySelectorAll('.de-document-editor__content .pm-page')];
      return all.indexOf(element.closest('.pm-page') as Element);
    });
    expect(index).toBe(full + 1);
    const cited = pages.nth(index).locator('.pm-page-footnotes');
    await expect(cited.locator('.pm-footnote-entry')).toHaveCount(1);
    await expect.poll(() => height(cited)).toBeGreaterThan(0);
    const [bottom, top] = await pages.nth(index).evaluate((element) => {
      const body = element.querySelector('.pm-page-content');
      const notes = element.querySelector('.pm-page-footnotes');
      const ends = [...(body?.children ?? [])].map((child) => child.getBoundingClientRect().bottom);
      return [Math.max(...ends), notes?.getBoundingClientRect().top ?? 0];
    });
    expect(bottom).toBeLessThanOrEqual(top + 0.5);
    // The page that cites none now keeps no room for footnotes.
    await expect.poll(() => height(area)).toBe(0);
    await page.keyboard.type('Noted.');
    await expect(cited.locator('.pm-footnote-entry')).toContainText('Noted.');
  });

  test('DOCE-EDITOR-4.5 DOCE-OBJECTS-1.7 inserts math from its dialog, typeset, and DOCE-EDITOR-3.8 converts it', async ({
    page,
  }) => {
    await newParagraph(page, 'Power', 'Energy is ');
    await toolbar(page).getByRole('button', { name: 'Math' }).click();
    await item(page, 'Inline math…').click();
    await expect(page.locator('[data-dialog="math"]')).toHaveCount(1);
    await dialog(page).getByRole('textbox', { name: 'LaTeX' }).fill('E = mc^2');
    await dialog(page).getByRole('button', { name: 'Insert' }).click();
    await expect(dialog(page)).toHaveCount(0);
    const inline = content(page).locator('.de-math[data-display="inline"]');
    await expect(inline).toHaveAttribute('data-state', 'ready');
    await expect(inline.locator('math msup')).toHaveCount(1);
    await inline.click({ button: 'right' });
    await item(page, 'Convert to display math').click();
    const display = content(page).locator('.de-math[data-display="display"]');
    await expect(display).toHaveAttribute('data-state', 'ready');
    await expect(inline).toHaveCount(0);
  });

  test('DOCE-EDITOR-4.5 links the selected word, and DOCE-EDITOR-3.8 removes the link', async ({
    page,
  }) => {
    await newParagraph(page, 'Power', 'See the datasheet');
    await page.keyboard.press('Shift+ControlOrMeta+ArrowLeft');
    // Under load the word may not be selected yet when the button is pressed: wait for it.
    await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe('datasheet');
    await toolbar(page).getByRole('button', { name: 'Link' }).click();
    const address = dialog(page).getByRole('textbox', { name: 'Address' });
    await address.fill('https://example.com/sheet');
    await expect(address).toHaveValue('https://example.com/sheet');
    await address.press('Enter');
    await expect(dialog(page)).toHaveCount(0);
    const link = content(page).locator('a[href="https://example.com/sheet"]', {
      hasText: 'datasheet',
    });
    await expect(link).toHaveCount(1);
    await link.click({ button: 'right' });
    await item(page, 'Remove link').click();
    await expect(link).toHaveCount(0);
  });

  test('DOCE-EDITOR-4.5 inserts an uploaded figure, and DOCE-EDITOR-3.8 aligns it', async ({
    page,
  }) => {
    await newParagraph(page, 'Power', '');
    await toolbar(page).getByRole('button', { name: 'Figure' }).click();
    await item(page, 'Image…').click();
    await expect(page.locator('[data-dialog="figure"]')).toHaveCount(1);
    await dialog(page)
      .locator('input[type="file"]')
      .setInputFiles({ name: 'board.png', mimeType: 'image/png', buffer: PIXEL });
    await dialog(page).getByRole('textbox', { name: 'Caption' }).fill('The board');
    await dialog(page).getByRole('button', { name: 'Insert' }).click();
    const figure = content(page).locator('figure[data-file-asset-id]');
    await expect(figure).toHaveCount(1);
    await expect(figure).toContainText('The board');
    await figure.click({ button: 'right' });
    await item(page, 'Align').click();
    await choice(page, 'Center').click();
    await expect(figure).toHaveAttribute('data-object-layout', 'center');
  });

  test('DOCE-OBJECTS-1.4 DOCE-OBJECTS-1.11 places a chosen image clamped to the page and resizes it in proportion', async ({
    page,
  }) => {
    const figure = await insertWidePanel(page, 'The panel');
    // The 800 by 400 image is narrower than the page's content once placed.
    const placed = Number(await figure.getAttribute('data-figure-width'));
    expect(placed).toBeLessThan(800);
    await expect(figure).toHaveAttribute('data-figure-height', String(Math.round(placed / 2)));
    await figure.click({ button: 'right' });
    await item(page, 'Resize…').click();
    const resize = page.getByRole('dialog', { name: 'Resize figure' });
    const width = resize.getByRole('textbox', { name: 'Width (px)' });
    await expect(width).toHaveValue(String(placed));
    await width.fill('300');
    await width.press('Tab');
    await expect(resize.getByRole('textbox', { name: 'Height (px)' })).toHaveValue('150');
    await resize.getByRole('button', { name: 'Apply' }).click();
    await expect(figure).toHaveAttribute('data-figure-width', '300');
    await expect(figure).toHaveAttribute('data-figure-height', '150');
  });

  test('DOCE-OBJECTS-1.11 offers edit, resize and delete on a figure, and keeps the fitted size when aligned', async ({
    page,
  }) => {
    const figure = await insertWidePanel(page, 'The panel');
    await figure.click({ button: 'right' });
    const names = await page.getByRole('menu').last().getByRole('menuitem').allTextContents();
    const at = (name: string) => names.findIndex((each) => each.startsWith(name));
    expect(at('Edit figure…')).toBeGreaterThanOrEqual(0);
    expect(at('Resize…')).toBe(at('Edit figure…') + 1);
    expect(at('Delete')).toBeGreaterThan(at('Resize…'));
    await item(page, 'Edit figure…').click();
    await expect(dialog(page).getByRole('textbox', { name: 'Caption' })).toHaveValue('The panel');
    await expect(dialog(page).getByRole('figure', { name: 'Preview' })).toHaveAttribute(
      'data-state',
      'ready',
    );
    await dialog(page).getByRole('button', { name: 'Cancel' }).click();
    await figure.click({ button: 'right' });
    await item(page, 'Align').click();
    await choice(page, 'Page width').click();
    await expect(figure).toHaveAttribute('data-object-layout', 'fit-page-width');
    const fitted = await figure.locator('img').evaluate((image) => image.getBoundingClientRect());
    await figure.click({ button: 'right' });
    await item(page, 'Align').click();
    await choice(page, 'Left').click();
    await expect(figure).toHaveAttribute('data-object-layout', 'left');
    const scale = await content(page).evaluate(
      (element) => element.getBoundingClientRect().width / (element as HTMLElement).offsetWidth,
    );
    await expect(figure).toHaveAttribute(
      'data-figure-width',
      String(Math.round(fitted.width / scale)),
    );
    await figure.click({ button: 'right' });
    await item(page, 'Align').click();
    await choice(page, 'Left').click();
    await expect(figure).not.toHaveAttribute('data-object-layout');
  });

  test('DOCE-OBJECTS-1.4 draws a diagram straight from the menu, then edits it', async ({
    page,
  }) => {
    await newParagraph(page, 'Power', '');
    await toolbar(page).getByRole('button', { name: 'Figure' }).click();
    await item(page, 'Diagram…').click();
    // The host's editor opens at once, and its saved drawing becomes the figure with no dialog.
    const figure = content(page).locator('figure[data-figure-type="diagram"]');
    await expect(figure).toHaveAttribute('data-figure-width', '480');
    await expect(page.locator('[data-dialog="figure"]')).toHaveCount(0);
    const first = await figure.getAttribute('data-file-asset-id');
    await figure.click({ button: 'right' });
    await item(page, 'Edit figure…').click();
    await dialog(page).getByRole('button', { name: 'Edit diagram…' }).click();
    await dialog(page).getByRole('button', { name: 'Apply' }).click();
    await expect(figure).not.toHaveAttribute('data-file-asset-id', first ?? '');
  });

  test('DOCE-EDITOR-4.6 uploads a pasted image as a figure', async ({ page }) => {
    await newParagraph(page, 'Power', '');
    await content(page).evaluate(
      (element, bytes) => {
        const data = new DataTransfer();
        data.items.add(new File([new Uint8Array(bytes)], 'pasted.png', { type: 'image/png' }));
        const target = element.querySelector('[contenteditable="true"]') ?? element;
        target.dispatchEvent(
          new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
        );
      },
      [...PIXEL],
    );
    await expect(content(page).locator('figure[data-file-asset-id]')).toHaveCount(1);
  });

  test('DOCE-EDITOR-4.5 inserts linked code the host resolves, and DOCE-EDITOR-3.8 sets its language', async ({
    page,
  }) => {
    await newParagraph(page, 'Power', '');
    await toolbar(page).getByRole('button', { name: 'Code' }).click();
    await item(page, 'Linked code…').click();
    await dialog(page)
      .getByRole('textbox', { name: 'Code address' })
      .fill('https://example.com/firmware/clock.ts#L2-L3');
    await expect(dialog(page)).toContainText('return elapsed / PERIOD;');
    await dialog(page).getByRole('button', { name: 'Insert' }).click();
    const linked = content(page).locator('[data-linked-code-block]');
    await expect(linked).toContainText('const elapsed = now - started;');
    await expect(linked).not.toContainText('export function tick');
    await linked.click({ button: 'right' });
    await item(page, 'Language').click();
    await choice(page, 'JavaScript').click();
    await expect(linked).toHaveAttribute('data-code-language', 'javascript');
    // An address the host has no code for says so.
    await linked.click({ button: 'right' });
    await item(page, 'Edit linked code…').click();
    await dialog(page)
      .getByRole('textbox', { name: 'Code address' })
      .fill('https://example.com/none.ts');
    await expect(dialog(page)).toContainText('No code at this address.');
    await expect(dialog(page).getByRole('button', { name: 'Apply' })).toBeDisabled();
  });

  test('DOCE-EDITOR-4.5 offers inline code first in the code menu, and DOCE-EDITOR-3.8 deletes it', async ({
    page,
  }) => {
    await newParagraph(page, 'Power', 'Call ');
    await toolbar(page).getByRole('button', { name: 'Code' }).click();
    const entries = page.getByRole('menu').last().locator('[role^="menuitem"]');
    await expect(entries.first()).toHaveText(/^Inline code/);
    await expect(entries.first()).toHaveAttribute('role', 'menuitemcheckbox');
    await entries.first().click();
    await page.keyboard.type('tick()');
    const paragraph = content(page).locator('p', { hasText: 'Call tick()' });
    await expect(paragraph.locator('code')).toHaveText('tick()');
    await paragraph.locator('code').click({ button: 'right' });
    await item(page, 'Delete inline code').click();
    await expect(paragraph.locator('code')).toHaveCount(0);
    await expect(content(page).locator('p', { hasText: /^Call\s*$/ })).toHaveCount(1);
  });

  test('DOCE-OBJECTS-3.3 highlights a code block in the language it is set to', async ({
    page,
  }) => {
    await newParagraph(page, 'Power', '');
    await page.keyboard.press('ControlOrMeta+Alt+C');
    await page.keyboard.type('const size = 4;');
    const code = content(page).locator('pre', { hasText: 'const size = 4;' });
    // The text of the ranges painted with a kind's highlight.
    const painted = (kind: string) =>
      page.evaluate(
        (name) => [...(CSS.highlights.get(name) ?? [])].map((range) => String(range)),
        `de-code-${kind}`,
      );
    await expect.poll(() => painted('keyword')).not.toContain('const');
    await code.click({ button: 'right' });
    await item(page, 'Language').click();
    await expect(page.getByRole('menu').last().getByRole('menuitemcheckbox')).toHaveText([
      'Plain text',
      'JavaScript',
      'Python',
      'Java',
      'C',
      'C++',
      'HTML',
      'CSS',
      'JSON',
      'XML',
      'SQL',
    ]);
    await choice(page, 'JavaScript').click();
    await expect.poll(() => painted('keyword')).toContain('const');
    await expect.poll(() => painted('number')).toContain('4');
    // The text is painted over, not split into elements.
    await expect(code.locator('.de-code-token')).toHaveCount(0);
    await expect(code.locator('code')).toHaveText('const size = 4;');
  });

  test('DOCE-EDITOR-4.5 inserts a list of figures, a code block and a symbol', async ({ page }) => {
    await newParagraph(page, 'Power', 'Tolerance ');
    await toolbar(page).getByRole('button', { name: 'Symbol' }).click();
    await page
      .getByRole('dialog')
      .getByRole('searchbox')
      .or(page.getByRole('dialog').getByRole('textbox'))
      .first()
      .fill('plus-minus');
    await page
      .getByRole('gridcell', { name: 'Plus-minus sign' })
      .or(page.getByRole('row', { name: 'Plus-minus sign' }))
      .first()
      .click();
    await expect(content(page).locator('p', { hasText: 'Tolerance ±' })).toHaveCount(1);
    // Focus is back in the document after the character.
    await page.keyboard.type(' 2');
    await expect(content(page).locator('p', { hasText: 'Tolerance ± 2' })).toHaveCount(1);
    await toolbar(page).getByRole('button', { name: 'Code' }).click();
    await item(page, 'Code block').click();
    await page.keyboard.type('let x = 1;');
    await expect(content(page).locator('pre', { hasText: 'let x = 1;' })).toHaveCount(1);
    await toolbar(page).getByRole('button', { name: 'List of contents' }).click();
    await expect(page.getByRole('menu').last().getByRole('menuitem')).toHaveText([
      'Table of contents',
      'List of figures',
      'List of tables',
      'List of equations',
      'List of code',
      'List of references',
      'List of abbreviations',
    ]);
    await item(page, 'List of figures').click();
    await expect(content(page).locator('[data-contents-type="figures"]')).toHaveCount(1);
  });

  test('DOCE-OBJECTS-3.1 numbers the lines of linked code from its first line', async ({
    page,
  }) => {
    await newParagraph(page, 'Power', '');
    await toolbar(page).getByRole('button', { name: 'Code' }).click();
    await item(page, 'Linked code…').click();
    await dialog(page)
      .getByRole('textbox', { name: 'Code address' })
      .fill('https://example.com/firmware/clock.ts#L2-L3');
    await expect(dialog(page)).toContainText('return elapsed / PERIOD;');
    await dialog(page).getByRole('button', { name: 'Insert' }).click();
    await expect(
      content(page).locator('[data-linked-code-block] .de-code-gutter__number'),
    ).toHaveText(['2', '3']);
  });

  test('DOCE-OBJECTS-3.1 wraps a long numbered line, its later rows left blank in the gutter', async ({
    page,
  }) => {
    await newParagraph(page, 'Power', '');
    await toolbar(page).getByRole('button', { name: 'Code' }).click();
    await item(page, 'Code block').click();
    await page.keyboard.type(`const long = "${'word '.repeat(40)}";`);
    await page.keyboard.press('Enter');
    await page.keyboard.type('next();');
    const block = content(page).locator('pre', { hasText: 'next();' });
    const rows = block.locator('.de-code-gutter__line');
    await expect(rows.locator('.de-code-gutter__number')).toHaveText(['1', '2']);
    const geometry = await block.evaluate((pre) => {
      const code = pre.querySelector('code') as HTMLElement;
      const [first, second] = [...pre.querySelectorAll('.de-code-gutter__line')].map((row) =>
        row.getBoundingClientRect(),
      );
      const height = parseFloat(getComputedStyle(code).lineHeight);
      // On the engine's lines the code holds a text node a line.
      const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
      let text = walker.nextNode() as Text | null;
      while (text && !text.data.includes('next();')) text = walker.nextNode() as Text | null;
      if (!text) throw new Error('No second line');
      const range = document.createRange();
      const at = text.data.indexOf('next();');
      range.setStart(text, at);
      range.setEnd(text, at + 1);
      return {
        height,
        first: first?.height ?? 0,
        secondTop: second?.top ?? 0,
        nextTop: range.getBoundingClientRect().top,
        scrolls: code.scrollWidth > code.clientWidth + 1,
      };
    });
    // The first line wraps over several rows; the gutter's second number sits level with line 2.
    expect(geometry.first).toBeGreaterThan(geometry.height * 1.5);
    expect(Math.abs(geometry.secondTop - geometry.nextTop)).toBeLessThan(2);
    expect(geometry.scrolls).toBe(false);
  });

  test('DOCE-EDITOR-4.5 previews linked code numbered from its line in its file, scrolling the preview alone', async ({
    page,
  }) => {
    await newParagraph(page, 'Power', '');
    await toolbar(page).getByRole('button', { name: 'Code' }).click();
    await item(page, 'Linked code…').click();
    const modal = page.locator('[data-dialog="linked-code"]');
    const preview = modal.locator('.de-linked-code-preview');
    const field = dialog(page).getByRole('textbox', { name: 'Code address' });
    await expect(dialog(page)).toContainText('For example https://example.com/');
    await expect(preview).toHaveAttribute('data-state', 'idle');
    await expect(preview.locator('.de-linked-code-preview__empty')).toBeVisible();
    await field.fill('https://example.com/firmware/clock.ts#L2-L3');
    await expect(preview).toHaveAttribute('data-state', 'ready');
    const numbers = preview.locator('.ui-code-block__line-number');
    await expect(numbers).toHaveCount(2);
    await expect(numbers.first()).toHaveAttribute('data-line-number', '2');
    // Highlighted in its language: `const` is a keyword.
    await expect(preview.locator('[data-token="keyword"]', { hasText: 'const' })).toHaveCount(1);
    // A whole file scrolls in the preview, while the field stays in view.
    await field.fill('https://example.com/firmware/schedule.ts');
    await expect(numbers).toHaveCount(120);
    const body = modal.locator('.ui-dialog__body');
    const sizes = await body.evaluate((element) => ({
      scrolls: element.scrollHeight > element.clientHeight + 1,
    }));
    expect(sizes.scrolls).toBe(false);
    await preview.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect.poll(() => preview.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expect(field).toBeInViewport();
  });

  test('DOCE-OBJECTS-3.4 puts the caret in the code for a press on its padding or gutter, and in its caption for a press there', async ({
    page,
  }) => {
    await newParagraph(page, 'Power', '');
    await page.keyboard.press('ControlOrMeta+Alt+C');
    await page.keyboard.type('alpha();\nbeta();');
    await page.keyboard.press('ArrowUp');
    const block = content(page).locator('.doc-code-figure', { hasText: 'beta();' });
    // Where the selection is: in the code block's text or its caption, and collapsed or not.
    const caret = () =>
      page.evaluate(() => {
        const selection = getSelection();
        const node = selection?.anchorNode;
        const element = node instanceof Element ? node : node?.parentElement;
        return {
          inCode: Boolean(element?.closest('pre > code')),
          inCaption: Boolean(element?.closest('.doc-code-caption-line')),
          collapsed: selection?.isCollapsed,
        };
      });
    const box = await block.boundingBox();
    if (!box) throw new Error('The code block is drawn');
    const gutter = await block.locator('.de-code-gutter__number').nth(1).boundingBox();
    const caption = await block.locator('.doc-caption-line').boundingBox();
    if (!gutter || !caption) throw new Error('The gutter and caption are drawn');
    const points = [
      { x: box.x + 2, y: box.y + box.height - 2 },
      { x: gutter.x + gutter.width / 2, y: gutter.y + gutter.height / 2 },
    ];
    for (const [index, point] of points.entries()) {
      await content(page).locator('h1', { hasText: 'Power' }).click();
      await page.mouse.click(point.x, point.y);
      await expect.poll(caret, { message: `press ${String(index)}` }).toEqual({
        inCode: true,
        inCaption: false,
        collapsed: true,
      });
    }
    await page.mouse.click(caption.x + caption.width - 4, caption.y + caption.height / 2);
    await expect.poll(caret).toEqual({ inCode: false, inCaption: true, collapsed: true });
    // A drag from the padding selects code text.
    await page.mouse.move(box.x + 2, box.y + box.height - 2);
    await page.mouse.down();
    const text = await block.locator('code').boundingBox();
    if (!text) throw new Error('The code is drawn');
    await page.mouse.move(text.x + 1, text.y + 4, { steps: 4 });
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => String(getSelection()))).toContain('alpha');
  });

  test('DOCE-OBJECTS-2.1 DOCE-FOOTNOTES-1.2 types a code block’s caption as text, bold, with a footnote cited from it', async ({
    page,
  }) => {
    await newParagraph(page, 'Power', '');
    await page.keyboard.press('ControlOrMeta+Alt+C');
    await page.keyboard.type('alpha();');
    const block = content(page).locator('.doc-code-figure', { hasText: 'alpha();' });
    const line = block.locator('.doc-code-caption-line');
    const caption = line.locator('[data-doc-caption-text]');
    // The caption is empty, so the press goes on its line, after its label.
    const box = await line.boundingBox();
    if (!box) throw new Error('The caption line is drawn');
    await page.mouse.click(box.x + box.width - 4, box.y + box.height / 2);
    await page.keyboard.type('Setup ');
    await page.keyboard.press('ControlOrMeta+B');
    await page.keyboard.type('steps');
    await expect(caption).toHaveText('Setup steps');
    await expect(caption.locator('strong')).toHaveText('steps');
    // Enter adds no line to a caption, and the code is left as it was.
    await page.keyboard.press('Enter');
    await expect(block.locator('code')).toHaveText('alpha();');
    const button = toolbar(page).getByRole('button', { name: 'Footnote' });
    await expect(button).toBeEnabled();
    await button.click();
    await page.keyboard.type('From the code caption.');
    await expect(
      content(page).locator('.pm-footnote-entry', { hasText: 'From the code caption.' }),
    ).toHaveCount(1);
    await expect(caption.locator('.footnote-reference')).toHaveCount(1);
  });

  test('DOCE-OBJECTS-3.2 draws a signature from its strokes with the signer name', async ({
    page,
  }) => {
    const signature = content(page).locator('.de-signature');
    await expect(signature).toHaveAttribute('data-signed', 'true');
    await expect(signature.locator('svg path')).toHaveCount(1);
    await expect(signature.locator('.de-signature__name')).toHaveText('Ada Lovelace');
  });
});

// A 1 by 1 pixel PNG.
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);
