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

// Selects a text in the document's content as one DOM selection, the editor focused.
async function selectWords(page: Page, wanted: string) {
  await content(page).evaluate((root, text) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.textContent?.indexOf(text) ?? -1;
      if (at < 0) continue;
      (node.parentElement?.closest('[contenteditable="true"]') as HTMLElement | null)?.focus();
      document.getSelection()?.setBaseAndExtent(node, at, node, at + text.length);
      return;
    }
    throw new Error(`No text ${text}`);
  }, wanted);
}

// The references the tests insert, apart from the lab's paragraph of citations.
const reference = (page: Page) =>
  content(page).locator('p', { hasNotText: 'Background is in' }).locator('[data-reference="true"]');
const cited = (page: Page, text: string) =>
  content(page).locator('[data-reference="true"]', { hasText: text });

test.describe('references', () => {
  test.beforeEach(async ({ lab }) => {
    await lab.open('full-editor');
  });

  test('DOCE-REFERENCES-3.1 DOCE-REFERENCES-1.2 DOCE-EDITOR-6.2 inserts a reference to a heading with Mod-K, and it follows the heading', async ({
    page,
  }) => {
    await newParagraph(page, 'Power', 'See ');
    // Mod-K opens the toolbar's reference menu on its first kind of reference.
    await page.keyboard.press('ControlOrMeta+k');
    await expect(item(page, 'Reference in this document')).toBeFocused();
    await page.keyboard.press('Enter');
    // The target's kind, then the target among those of the kind.
    await expect(dialog(page).getByRole('button', { name: /Target type/ })).toContainText(
      'Heading',
    );
    await expect(dialog(page)).toHaveAccessibleName('Reference in this document');
    const picker = dialog(page).getByRole('combobox', { name: 'Target' });
    // Insert waits for a target, and a target of another kind is cleared.
    await expect(dialog(page).getByRole('button', { name: 'Insert' })).toBeDisabled();
    await picker.fill('Power');
    await page.getByRole('option', { name: /^\d+\.\s*Power$/ }).click();
    await dialog(page)
      .getByRole('button', { name: /Target type/ })
      .click();
    await page.getByRole('option', { name: 'Table' }).click();
    await expect(picker).toHaveValue('');
    await expect(dialog(page).getByRole('button', { name: 'Insert' })).toBeDisabled();
    await dialog(page)
      .getByRole('button', { name: /Target type/ })
      .click();
    await page.getByRole('option', { name: 'Heading' }).click();
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
    // DOCE-REFERENCES-1.3: a plain click while editing takes the reader to the heading, at the top
    // of the view.
    await reference(page).click();
    await expect(async () => {
      const offset = await content(page)
        .locator('h1', { hasText: 'Timing budget' })
        .evaluate((heading) => {
          let scroller = heading.parentElement;
          while (scroller && scroller.scrollHeight <= scroller.clientHeight) {
            scroller = scroller.parentElement;
          }
          const top = scroller?.getBoundingClientRect().top ?? 0;
          return heading.getBoundingClientRect().top - Math.max(top, 0);
        });
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset).toBeLessThan(60);
    }).toPass();
    // Editing opens the same dialog, titled as inserting, on its target.
    await reference(page).click({ button: 'right' });
    await item(page, 'Edit reference…').click();
    await expect(dialog(page)).toHaveAccessibleName('Reference in this document');
    await expect(dialog(page).getByRole('combobox', { name: 'Target' })).toHaveValue(
      /Timing budget$/,
    );
    await expect(dialog(page).getByRole('button', { name: 'Apply' })).toBeVisible();
    await page.keyboard.press('Escape');
    // The menu removes it, keeping its text.
    await reference(page).click({ button: 'right' });
    await item(page, 'Remove reference').click();
    await expect(reference(page)).toHaveCount(0);
    await expect(content(page).locator('p', { hasText: /See .*Timing budget/ })).toHaveCount(1);
  });

  test('DOCE-REFERENCES-3.1 a dismissed reference dialog keeps the selection it would replace', async ({
    page,
  }) => {
    await newParagraph(page, 'Power', 'See the scope');
    const paragraph = content(page).locator('p', { hasText: 'See the' });
    const selected = () => page.evaluate(() => document.getSelection()?.toString());
    for (const dismiss of ['Escape', 'outside'] as const) {
      await selectWords(page, 'scope');
      await toolbar(page).getByRole('button', { name: 'Reference' }).click();
      // Both of the library's own dialogs, this document's and another document's.
      await item(
        page,
        dismiss === 'Escape' ? 'Reference in this document…' : 'Reference to another document…',
      ).click();
      await expect(dialog(page)).toBeVisible();
      if (dismiss === 'Escape') await page.keyboard.press('Escape');
      // A click on the document's own text only dismisses the dialog: the caret stays.
      else await paragraph.click({ position: { x: 4, y: 4 }, force: true });
      await expect(dialog(page)).toHaveCount(0);
      await expect.poll(selected).toBe('scope');
    }
    // The writer types over the selection as before the dialog opened.
    await page.keyboard.type('plan');
    await expect(paragraph).toHaveText('See the plan');
  });

  test('DOCE-REFERENCES-3.1 DOCE-REFERENCES-1.10 cites another document the host finds', async ({
    page,
  }) => {
    await newParagraph(page, 'Power', 'As in ');
    await toolbar(page).getByRole('button', { name: 'Reference' }).click();
    await item(page, 'Reference to another document…').click();
    await expect(dialog(page)).toHaveAccessibleName('Reference to another document');
    await expect(page.locator('[data-reference="external"]')).toBeVisible();
    await dialog(page).getByRole('combobox', { name: 'Document' }).fill('power');
    // The host's description shows on the row.
    await expect(
      page.getByRole('option', { name: /PWR-100 Power interface specification/ }),
    ).toContainText('Rev B');
    await page.getByRole('option', { name: /PWR-100 Power interface specification/ }).click();
    await dialog(page).getByRole('button', { name: 'Insert' }).click();
    await expect(reference(page)).toHaveText('PWR-100 - Power interface specification');
    await expect(reference(page)).toHaveAttribute('data-ref-type', 'external-document');
  });

  test('DOCE-REFERENCES-3.1 DOCE-REFERENCES-1.11 cites a heading of another document with its revision, and edits it filled in', async ({
    page,
  }) => {
    await newParagraph(page, 'Power', 'As in ');
    await toolbar(page).getByRole('button', { name: 'Reference' }).click();
    await item(page, 'Reference to another document…').click();
    const insert = dialog(page).getByRole('button', { name: 'Insert' });
    await dialog(page).getByRole('combobox', { name: 'Document' }).fill('power');
    await page.getByRole('option', { name: /PWR-100/ }).click();
    // A target type asks for a target of that type before Insert.
    await dialog(page)
      .getByRole('button', { name: /Target type/ })
      .click();
    await page.getByRole('option', { name: 'Heading' }).click();
    await expect(insert).toBeDisabled();
    await dialog(page).getByRole('combobox', { name: 'Target' }).fill('Supply');
    await page.getByRole('option', { name: '2. Supply rails' }).click();
    await dialog(page).getByText('Include revision').click();
    await insert.click();
    await expect(reference(page)).toHaveText(
      'PWR-100 - Power interface specification Rev B § 2. Supply rails',
    );
    await expect(reference(page)).toHaveAttribute('data-include-revision', 'true');
    // Editing opens the same dialog, titled as inserting, with the citation filled in.
    await reference(page).click({ button: 'right' });
    await item(page, 'Edit reference…').click();
    await expect(dialog(page)).toHaveAccessibleName('Reference to another document');
    await expect(dialog(page).getByRole('combobox', { name: 'Document' })).toHaveValue(
      'PWR-100 - Power interface specification',
    );
    await expect(dialog(page).getByRole('combobox', { name: 'Target' })).toHaveValue(
      '2. Supply rails',
    );
    await expect(dialog(page).getByRole('checkbox', { name: 'Include revision' })).toBeChecked();
    // Another type clears the target; the whole document needs none.
    await dialog(page)
      .getByRole('button', { name: /Target type/ })
      .click();
    await page.getByRole('option', { name: 'Whole document' }).click();
    await dialog(page).getByText('Include revision').click();
    await dialog(page).getByRole('button', { name: 'Apply' }).click();
    await expect(reference(page)).toHaveText('PWR-100 - Power interface specification');
  });

  test("DOCE-REFERENCES-1.12 offers the host's own reference type and edits it in the host's dialog", async ({
    page,
  }) => {
    await newParagraph(page, 'Power', 'Per ');
    await toolbar(page).getByRole('button', { name: 'Reference' }).click();
    // The editor's entries, then the host's.
    await expect(page.getByRole('menu').last().getByRole('menuitem')).toHaveText([
      /Reference in this document/,
      'Reference to another document…',
      'Catalogue entry…',
    ]);
    await item(page, 'Catalogue entry…').click();
    await dialog(page).getByRole('button', { name: /Entry/ }).click();
    await page.getByRole('option', { name: 'STD-12 Connector practice' }).click();
    await dialog(page)
      .getByRole('button', { name: /Revision/ })
      .click();
    await page.getByRole('option', { name: 'Rev B' }).click();
    await dialog(page).getByRole('button', { name: 'Insert' }).click();
    await expect(reference(page)).toHaveText('STD-12 Rev B');
    await expect(reference(page)).toHaveAttribute('data-library-revision-id', 'std-12@B');
    // Editing opens the host's dialog, keeping the pinned revision.
    await reference(page).click({ button: 'right' });
    await item(page, 'Edit reference…').click();
    await expect(page.locator('[data-dialog="catalogue-reference"]')).toBeVisible();
    await expect(dialog(page).getByRole('button', { name: /Revision/ })).toContainText('Rev B');
  });

  test('DOCE-REFERENCES-1.5 marks citations the host resolved, and takes an update once confirmed', async ({
    page,
  }) => {
    const thermal = cited(page, 'THM-200');
    const gone = cited(page, 'Removed section');
    await expect(
      content(page).locator('[data-reference-status="update"]', { hasText: 'THM-200' }),
    ).toHaveAttribute('title', 'The cited document has changed since it was cited');
    await expect(
      content(page).locator('[data-reference-status="broken"]', { hasText: 'Removed section' }),
    ).toHaveCount(1);
    await expect(page.getByRole('status', { name: 'Host feedback' })).toHaveText(
      'A cited document no longer holds a target',
    );
    await expect(gone).toHaveCount(1);
    await thermal.click({ button: 'right' });
    await item(page, 'Update reference…').click();
    await expect(dialog(page)).toHaveAccessibleName('Update reference');
    await expect(dialog(page)).toContainText('THM-200 - Thermal notes');
    await expect(dialog(page)).toContainText('THM-200 - Thermal design notes');
    // Nothing changes until it is confirmed.
    await expect(thermal).toHaveText('THM-200 - Thermal notes');
    await dialog(page).getByRole('button', { name: 'Update' }).click();
    await expect(thermal).toHaveText('THM-200 - Thermal design notes');
    await expect(content(page).locator('[data-reference-status="update"]')).toHaveCount(0);
  });

  test('DOCE-REFERENCES-3.2 DOCE-REFERENCES-2.1 adds a glossary entry from the selection and switches its form', async ({
    page,
  }) => {
    await newParagraph(page, 'Power', 'Check the Battery Charging Unit');
    // The words are selected as the reader's drag would leave them, in one step: key presses can
    // be dropped by a layout landing between them, or after Escape before focus is back. A layout
    // may still land before the editor reads the selection, so it is selected again until the
    // dialog opens on all three.
    await expect(async () => {
      if (await dialog(page).isVisible()) await page.keyboard.press('Escape');
      await selectWords(page, 'Battery Charging Unit');
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

  test('DOCE-REFERENCES-3.2 DOCE-REFERENCES-3.4 makes selected words an abbreviation of the entry the glossary has', async ({
    page,
  }) => {
    await newParagraph(page, 'Power', 'Load the Ground support equipment');
    await expect(async () => {
      if (await dialog(page).isVisible()) await page.keyboard.press('Escape');
      await selectWords(page, 'Ground support equipment');
      await page.keyboard.press('Shift+F10');
      await item(page, 'Create abbreviation…').click({ timeout: 2000 });
      await expect(dialog(page).getByRole('textbox', { name: 'Expansion' })).toHaveValue(
        'Ground support equipment',
        { timeout: 2000 },
      );
    }).toPass();
    // The host's notice shows, and the entry written is the glossary's own, so it is used.
    await expect(dialog(page)).toContainText('Glossary entries are shared by every document.');
    await dialog(page).getByRole('textbox', { name: 'Abbreviation' }).fill('gse');
    await expect(dialog(page).locator('[data-abbreviation-duplicate]')).toContainText(
      'GSE: Ground support equipment is already in the glossary.',
    );
    await expect(dialog(page).getByRole('button', { name: 'Add to glossary' })).toHaveCount(0);
    // Short, as the preview reads.
    await dialog(page).getByRole('radio', { name: 'Short' }).click();
    await expect(dialog(page).locator('[data-abbreviation-preview]')).toContainText('GSE');
    await dialog(page).getByRole('button', { name: 'Insert' }).click();
    const abbreviation = content(page).locator('[data-abbreviation-ref="glossary-gse"]');
    await expect(abbreviation).toHaveAttribute('data-abbr-display', 'short');
    await expect(abbreviation).toHaveText('GSE');
    // Reached from the keyboard, it shows its tooltip, and leaving it hides it: the caret is right
    // after it once inserted.
    const tip = page.locator('.de-document-editor__abbreviation-tip');
    await expect(tip).toHaveCount(0);
    await page.keyboard.press('ArrowLeft');
    await expect(tip).toHaveText('GSE — Ground support equipment');
    await page.keyboard.press('ArrowLeft');
    await expect(tip).toHaveCount(0);
    // Every abbreviation offers to cite another entry.
    await abbreviation.click({ button: 'right' });
    await expect(item(page, 'Cite another entry…')).toBeVisible();
  });

  test('DOCE-REFERENCES-2.1 typing right after inserting an abbreviation goes on after it', async ({
    page,
  }) => {
    await newParagraph(page, 'Power', 'Load the GSE');
    await expect(async () => {
      if (await dialog(page).isVisible()) await page.keyboard.press('Escape');
      await selectWords(page, 'GSE');
      await toolbar(page).getByRole('button', { name: 'Abbreviation…' }).click();
      await expect(dialog(page).getByRole('textbox', { name: 'Abbreviation' })).toHaveValue('GSE', {
        timeout: 2000,
      });
    }).toPass();
    await dialog(page).getByRole('combobox', { name: 'Glossary entry' }).fill('GSE');
    await page.getByRole('option', { name: /GSE/ }).click();
    await dialog(page).getByRole('button', { name: 'Insert' }).click();
    await expect(dialog(page)).toHaveCount(0);
    await page.keyboard.type(' first');
    const paragraph = content(page).locator('p', { hasText: 'Load the' });
    await expect(paragraph).toHaveText(/^Load the Ground support equipment \(GSE\) first$/);
    await expect(paragraph.locator('[data-abbreviation-ref]')).toHaveCount(1);
  });

  test('DOCE-PAGINATION-7.23 types after a trailing inline atom, and joins a paragraph holding only one', async ({
    page,
  }) => {
    await newParagraph(page, 'Power', 'Load the GSE');
    await expect(async () => {
      if (await dialog(page).isVisible()) await page.keyboard.press('Escape');
      await selectWords(page, 'GSE');
      await toolbar(page).getByRole('button', { name: 'Abbreviation…' }).click();
      await expect(dialog(page).getByRole('textbox', { name: 'Abbreviation' })).toHaveValue('GSE', {
        timeout: 2000,
      });
    }).toPass();
    await dialog(page).getByRole('combobox', { name: 'Glossary entry' }).fill('GSE');
    await page.getByRole('option', { name: /GSE/ }).click();
    await dialog(page).getByRole('button', { name: 'Insert' }).click();
    const paragraph = content(page).locator('p', { hasText: 'Load the' });
    const atoms = paragraph.locator('[data-abbreviation-ref]');
    await expect(atoms).toHaveCount(1);
    // The caret after the atom at the paragraph's end types after it.
    await page.keyboard.press('End');
    await page.keyboard.type(' now');
    await expect(paragraph).toHaveText(/Ground support equipment \(GSE\) now$/);
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    // The atom moved to a paragraph of its own and joined back keeps the text and one atom.
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Enter');
    await expect(
      content(page).locator('p', { hasText: /^Ground support equipment \(GSE\)$/ }),
    ).toHaveCount(1);
    await page.keyboard.press('Backspace');
    await expect(paragraph).toHaveText(/^Load the Ground support equipment \(GSE\)$/);
    await expect(atoms).toHaveCount(1);
  });
});
