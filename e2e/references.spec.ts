import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const content = (page: Page) => page.locator('.de-document-editor__content');
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Formatting' });
const dialog = (page: Page) => page.getByRole('dialog');
const item = (page: Page, name: string | RegExp) =>
  page.getByRole('menu').last().getByRole('menuitem', { name });

// Types a new paragraph after the heading, leaving the caret at its end once the pages are laid
// out again, so a repagination does not collapse a selection made next.
async function newParagraph(page: Page, heading: string, value: string) {
  await content(page).locator('h1', { hasText: heading }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type(value);
  await expect(page.locator('.de-document-editor').first()).toHaveAttribute(
    'data-layout-state',
    'settled',
  );
}

const reference = (page: Page) => content(page).locator('[data-reference="true"]');

test.describe('references', () => {
  test.beforeEach(async ({ lab }) => {
    await lab.open('full-editor');
  });

  test('DOCE-REFERENCES-3.1 DOCE-REFERENCES-1.2 inserts a reference to a heading with Mod-K, and it follows the heading', async ({
    page,
  }) => {
    await newParagraph(page, 'Power', 'See ');
    await page.keyboard.press('ControlOrMeta+k');
    // The target's kind, then the target among those of the kind.
    await expect(dialog(page).getByRole('button', { name: /Target type/ })).toContainText(
      'Heading',
    );
    const picker = dialog(page).getByRole('combobox', { name: 'Target' });
    await picker.fill('Timing');
    await page.getByRole('option', { name: /^\d+\.\s*Timing$/ }).click();
    await dialog(page).getByRole('button', { name: 'Insert' }).click();
    await expect(reference(page)).toHaveText(/Timing$/);
    await expect(reference(page)).toHaveAttribute('data-ref-type', 'internal-heading');
    // DOCE-REFERENCES-1.3: renaming the heading renames the reference.
    await content(page).locator('h1', { hasText: 'Timing' }).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' budget');
    await expect(reference(page)).toHaveText(/Timing budget$/);
    // The menu removes it, keeping its text.
    await reference(page).click({ button: 'right' });
    await item(page, 'Remove reference').click();
    await expect(reference(page)).toHaveCount(0);
    await expect(content(page).locator('p', { hasText: /See .*Timing budget/ })).toHaveCount(1);
  });

  test('DOCE-REFERENCES-3.1 cites another document the host finds', async ({ page }) => {
    await newParagraph(page, 'Power', 'As in ');
    await toolbar(page).getByRole('button', { name: 'Reference' }).click();
    await item(page, 'Reference to another document…').click();
    await dialog(page).getByRole('combobox', { name: 'Document' }).fill('power');
    await page.getByRole('option', { name: 'PWR-100 Power interface specification' }).click();
    await dialog(page).getByRole('button', { name: 'Insert' }).click();
    await expect(reference(page)).toHaveText('PWR-100');
    await expect(reference(page)).toHaveAttribute('data-ref-type', 'external-document');
  });

  test('DOCE-REFERENCES-3.2 DOCE-REFERENCES-2.1 adds a glossary entry from the selection and switches its form', async ({
    page,
  }) => {
    await newParagraph(page, 'Power', 'Check the Battery Charging Unit');
    // A layout may land between the presses and drop one, or before the editor reads the
    // selection, so the words are selected again until the dialog opens on all three.
    await expect(async () => {
      if (await dialog(page).isVisible()) await page.keyboard.press('Escape');
      await page.keyboard.press('End');
      for (const _ of [1, 2, 3]) await page.keyboard.press('Shift+ControlOrMeta+ArrowLeft');
      await toolbar(page).getByRole('button', { name: 'Abbreviation…' }).click();
      await expect(dialog(page).getByRole('textbox', { name: 'Abbreviation' })).toHaveValue('BCU', {
        timeout: 2000,
      });
    }).toPass();
    await expect(dialog(page).getByRole('textbox', { name: 'Expansion' })).toHaveValue(
      'Battery Charging Unit',
    );
    await dialog(page).getByRole('button', { name: 'Add to glossary' }).click();
    const abbreviation = content(page).locator('[data-abbreviation-ref]');
    await expect(abbreviation).toHaveAttribute('data-abbr', 'BCU');
    await expect(abbreviation).toHaveAttribute('data-abbr-display', 'full');
    await abbreviation.click({ button: 'right' });
    await item(page, 'Show short').click();
    await expect(abbreviation).toHaveAttribute('data-abbr-display', 'short');
  });
});
