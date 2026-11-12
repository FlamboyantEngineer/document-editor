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
    await toolbar(page).getByRole('button', { name: 'Link' }).click();
    await dialog(page).getByRole('textbox', { name: 'Address' }).fill('https://example.com/sheet');
    await page.keyboard.press('Enter');
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
    await choice(page, 'typescript').click();
    await expect(linked).toHaveAttribute('data-code-language', 'typescript');
    // An address the host has no code for says so.
    await linked.click({ button: 'right' });
    await item(page, 'Edit linked code…').click();
    await dialog(page)
      .getByRole('textbox', { name: 'Code address' })
      .fill('https://example.com/none.ts');
    await expect(dialog(page)).toContainText('No code at this address.');
    await expect(dialog(page).getByRole('button', { name: 'Apply' })).toBeDisabled();
  });

  test('DOCE-OBJECTS-3.3 highlights a code block in the language it is set to', async ({
    page,
  }) => {
    await newParagraph(page, 'Power', '');
    await page.keyboard.press('ControlOrMeta+Alt+C');
    await page.keyboard.type('const size = 4;');
    const code = content(page).locator('pre', { hasText: 'const size = 4;' });
    await expect(code.locator('.de-code-token')).toHaveCount(0);
    await code.click({ button: 'right' });
    await item(page, 'Language').click();
    await choice(page, 'typescript').click();
    await expect(code.locator('.de-code-token[data-token="keyword"]')).toHaveText('const');
    await expect(code.locator('.de-code-token[data-token="number"]')).toHaveText('4');
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
    await toolbar(page).getByRole('button', { name: 'Code' }).click();
    await item(page, 'Code block').click();
    await page.keyboard.type('let x = 1;');
    await expect(content(page).locator('pre', { hasText: 'let x = 1;' })).toHaveCount(1);
    await toolbar(page).getByRole('button', { name: 'List of contents' }).click();
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
    await expect(content(page).locator('[data-linked-code-block] .de-code-gutter')).toHaveText(
      ['2', '3'].join('\n'),
    );
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
