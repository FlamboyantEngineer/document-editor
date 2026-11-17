import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures.js';
import { sectionOf } from './template-settings-steps.js';

const panel = (page: Page) =>
  page.getByRole('region', { name: 'Template settings' }).or(page.locator('.de-template-editor'));
const content = (page: Page) => page.locator('.de-document-editor__content');
const style = (page: Page, selector: string, property: string) =>
  content(page)
    .locator('.pm-page-content')
    .locator(selector)
    .first()
    .evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);

// The landscape segment of the orientation choice.
// Every page's header or footer.
const regions = (page: Page, kind: 'header' | 'footer') =>
  content(page).locator(`.pm-page-${kind}`);
// The text of every page's header or footer.
const regionTexts = (page: Page, kind: 'header' | 'footer') =>
  regions(page, kind).evaluateAll((all) => all.map((one) => one.textContent ?? ''));
// Clicks into the end of a block of one page's header or footer, its page scrolled to it, and
// returns the block.
async function clickRegion(
  page: Page,
  at: { kind: 'header' | 'footer'; page: number; block?: string; last?: boolean },
) {
  const blocks = regions(page, at.kind)
    .nth(at.page)
    .locator(at.block ?? 'p');
  const target = at.last === false ? blocks.first() : blocks.last();
  await target.scrollIntoViewIfNeeded();
  await target.click();
  await page.keyboard.press('End');
  return target;
}
// Types text key by key, each key's text shown in the block before the next key.
async function typeInto(page: Page, block: Locator, text: string) {
  const before = (await block.textContent()) ?? '';
  for (let index = 1; index <= text.length; index += 1) {
    await page.keyboard.type(text.charAt(index - 1));
    await expect(block).toHaveText(before + text.slice(0, index));
  }
}
// The template the editor holds, shown read only as JSON beside it.
const templateJson = (page: Page) => page.getByLabel('Template JSON');
const landscape = (page: Page) =>
  panel(page)
    .first()
    .getByRole('radio', { name: 'Landscape' })
    .or(panel(page).first().getByRole('button', { name: 'Landscape', exact: true }))
    .first();

// Opens a style's card and returns it.
async function card(page: Page, name: string) {
  const found = panel(page)
    .first()
    .locator('.ui-property-card', {
      has: page.getByRole('button', { name: new RegExp(`^${name}\\b`) }),
    });
  await found
    .getByRole('button', { name: new RegExp(`^${name}\\b`) })
    .first()
    .click();
  return found.first();
}

test.describe('template editor lab', () => {
  test('DOCE-TEMPLATE-EDITOR-1.1 DOCE-TEMPLATE-EDITOR-1.2 DOCE-LABS-3.1 restyles the document as settings change', async ({
    lab,
    page,
  }) => {
    await lab.open('template-editor');
    // DOCE-TEMPLATE-EDITOR-1.7: a size in points.
    const paragraph = await card(page, 'Paragraph');
    const size = paragraph.getByRole('textbox', { name: 'Size' });
    await expect(size).toHaveAttribute('placeholder', /^\d/);
    await size.fill('12');
    await size.press('Enter');
    await expect.poll(() => style(page, 'p', 'font-size')).toBe('16px');
    await size.fill('');
    await size.press('Enter');
    await expect.poll(() => style(page, 'p', 'font-size')).not.toBe('16px');

    const heading = await card(page, 'Heading 1');
    const colour = heading.getByRole('textbox', { name: 'Colour' });
    await colour.fill('#cc0000');
    await colour.press('Enter');
    await expect.poll(() => style(page, 'h1', 'color')).toBe('rgb(204, 0, 0)');

    await landscape(page).click();
    await expect
      .poll(() =>
        content(page)
          .locator('.pm-page')
          .first()
          .evaluate(
            (element) =>
              element.getBoundingClientRect().width > element.getBoundingClientRect().height,
          ),
      )
      .toBe(true);
  });

  test('DOCE-TEMPLATE-EDITOR-1.3 adds a section and sets its own settings', async ({
    lab,
    page,
  }) => {
    await lab.open('template-editor');
    const settings = panel(page).first();
    await settings.getByRole('button', { name: 'Add a section' }).click();
    await expect(settings).toHaveAttribute('data-scope', 'section');
    const name = settings.getByRole('textbox', { name: 'Label' });
    await name.fill('Appendix');
    await landscape(page).click();
    // The template holds the section.
    await page.getByLabel('Show as JSON').check();
    const json = templateJson(page);
    await expect(json).toContainText('"label": "Appendix"');
    await expect(json).toContainText('"orientation": "landscape"');
  });

  test('DOCE-TEMPLATE-EDITOR-1.4 DOCE-SECTIONS-5.1 edits the header in place on the pages', async ({
    lab,
    page,
  }) => {
    await lab.open('template-editor');
    const headers = content(page).locator('.pm-page-header');
    await expect(headers.first()).not.toHaveAttribute('contenteditable', 'false');
    await headers.first().locator('p').last().click();
    await page.keyboard.press('End');
    await page.keyboard.type(' Programme review');
    // Every page of the section shows it, and the template holds it.
    await expect(headers.nth(1)).toContainText('Programme review');
    await page.getByLabel('Show as JSON').check();
    await expect(templateJson(page)).toContainText('Programme review');
  });

  test('DOCE-TEMPLATE-EDITOR-1.6 DOCE-TEMPLATES-7.1 adds a custom style and applies it to a paragraph', async ({
    lab,
    page,
  }) => {
    await lab.open('template-editor');
    const settings = panel(page).first();
    await settings.getByRole('button', { name: 'Add a style' }).click();
    const paragraph = content(page).locator('.pm-page-content p').nth(2);
    await paragraph.click();
    const toolbar = page.getByRole('toolbar', { name: 'Formatting' });
    await toolbar.getByRole('button', { name: /Text style/ }).click();
    await page.getByRole('option', { name: 'style_1' }).click();
    await expect(paragraph).toHaveAttribute('data-custom-style', 'style_1');
    await expect
      .poll(() =>
        paragraph.evaluate((element) => Math.round(parseFloat(getComputedStyle(element).fontSize))),
      )
      .toBe(15);
    await toolbar.getByRole('button', { name: /Text style/ }).click();
    await page.getByRole('option', { name: 'Paragraph' }).click();
    await expect(paragraph).not.toHaveAttribute('data-custom-style');
    // The style's card renames it, and deletes it.
    await card(page, 'style_1');
    // The style's name is the last one; the template's is first.
    const name = panel(page).first().getByRole('textbox', { name: 'Name' }).last();
    await name.fill('note');
    await name.press('Enter');
    await expect(
      panel(page)
        .first()
        .getByRole('button', { name: /^note\b/ }),
    ).toHaveCount(1);
    await panel(page).first().getByRole('button', { name: 'Delete the style' }).click();
    await expect(panel(page).first().getByText('No custom styles yet.')).toBeVisible();
  });

  test('DOCE-TEMPLATE-EDITOR-1.7 offers fields for sizes, fonts, numbering and page sizes', async ({
    lab,
    page,
  }) => {
    await lab.open('template-editor');
    const settings = panel(page).first();
    // A page size with its dimensions.
    await expect(settings.getByRole('button', { name: /Page size$/ })).toContainText(
      'A4 (210 × 297 mm)',
    );
    // The inherited value names where it comes from.
    await expect(settings.getByRole('textbox', { name: 'Top margin' })).toBeVisible();
    await expect(
      settings.getByText(/^Inherited from Base template: /, { exact: false }).first(),
    ).toBeAttached();
    // A font picked from those offered, each drawn in its own font.
    const paragraph = await card(page, 'Paragraph');
    await paragraph.getByRole('button', { name: /Font$/ }).click();
    const georgia = page.getByRole('option', { name: 'Georgia', exact: true });
    expect(
      await georgia
        .locator('.de-template-editor__font-option')
        .evaluate((element) => getComputedStyle(element).fontFamily),
    ).toContain('Georgia');
    await georgia.click();
    await expect.poll(() => style(page, 'p', 'font-family')).toContain('Georgia');
    // Space before and after, in points, typed as numbers.
    const after = paragraph.getByRole('textbox', { name: 'Space after' });
    await after.fill('20');
    await after.press('Enter');
    await expect.poll(() => style(page, 'p', 'margin-bottom')).toBe('26.6667px');
    // Bold, italic and underline toggle on, off and back to inherited.
    const bold = paragraph.getByRole('button', { name: 'Bold' });
    await bold.click();
    await expect.poll(() => style(page, 'p', 'font-weight')).toBe('700');
    await paragraph.getByRole('button', { name: 'Italic' }).click();
    await expect.poll(() => style(page, 'p', 'font-style')).toBe('italic');
    await paragraph.getByRole('button', { name: 'Underline' }).click();
    await expect.poll(() => style(page, 'p', 'text-decoration-line')).toBe('underline');
    await bold.click();
    await expect(bold).toHaveAttribute('aria-pressed', 'false');
    await bold.click();
    await expect(bold).toHaveAttribute('aria-pressed', 'mixed');
    // A numbering format keeps only what numbers, and offers formats with the numbers they give.
    const heading = await card(page, 'Heading 1');
    const numbering = heading.getByRole('combobox', { name: 'Numbering', exact: true });
    await numbering.fill('Ab.1x');
    // Enter commits the draft while no format in the list the typing opened is picked; the open
    // list hides the rest of the panel, so Enter goes to the page.
    await page.keyboard.press('Enter');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(numbering).toHaveValue('A.1');
    await numbering.fill('');
    await page.getByRole('option', { name: /^I\.\s*I\., II\., III\./ }).click();
    await expect(numbering).toHaveValue('I.');
    await expect(heading.getByText('1, a, A, i or I for each level')).toBeVisible();
    // A heading has a line height of its own.
    await expect(heading.getByRole('textbox', { name: 'Line height' })).toHaveCount(1);
    // The margins, one row of four sides, in millimetres on an A4 page.
    const top = settings.getByRole('textbox', { name: 'Top margin' });
    // The four sides fit across the settings panel.
    const margins = sectionOf(settings, 'Page setup').locator('.ui-four-side-property-strip');
    expect(await margins.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    await expect(top).toHaveAttribute('placeholder', '25.4');
    await top.fill('40');
    await top.press('Enter');
    await expect
      .poll(() =>
        content(page)
          .locator('.pm-page-content')
          .first()
          .evaluate((element) =>
            Math.round(
              element.getBoundingClientRect().top -
                (element.closest('.pm-page')?.getBoundingClientRect().top ?? 0),
            ),
          ),
      )
      .toBeGreaterThan(140);
  });

  test('DOCE-TEMPLATE-EDITOR-1.8 DOCE-TEMPLATES-8.2 previews every style and section of the template', async ({
    lab,
    page,
  }) => {
    await lab.open('template-editor');
    await panel(page).first().getByRole('button', { name: 'Add a section' }).click();
    await page.getByRole('button', { name: 'Preview the template' }).click();
    await expect(content(page).locator('h1').first()).toHaveText('Lab template');
    for (const level of [1, 2, 3, 4, 5, 6]) {
      await expect(
        content(page).locator(`h${String(level)}`, { hasText: `Heading ${String(level)}` }),
      ).toHaveCount(1);
    }
    // The table and the code block go on over a page, each in two parts or more.
    await expect.poll(() => content(page).locator('table').count()).toBeGreaterThan(1);
    await expect.poll(() => content(page).locator('pre').count()).toBeGreaterThan(1);
    await expect(content(page).locator('[data-section-name]')).not.toHaveCount(0);
  });

  test('DOCE-TEMPLATE-EDITOR-1.8 DOCE-TEMPLATES-8.2 spaces the preview by the template on its first load', async ({
    lab,
    page,
  }) => {
    await lab.open('template-editor');
    await page.getByRole('button', { name: 'Preview the template' }).click();
    const heading = content(page).locator('h2', { hasText: 'Heading 2' });
    await expect(heading).toHaveCount(1);
    const margins = (locator: ReturnType<typeof content>) =>
      locator.evaluate((element) => {
        const computed = getComputedStyle(element);
        return [computed.marginTop, computed.marginBottom];
      });
    const css = (locator: ReturnType<typeof content>, name: string) =>
      locator.evaluate((element, property) => getComputedStyle(element)[property], name as 'color');
    // The base template's spacing, in CSS pixels: a heading 2 at 14pt and 7pt, a paragraph at 0pt
    // and 6pt, and a list at 0pt and 6pt.
    expect(await margins(heading)).toEqual(['18.6667px', '9.33333px']);
    expect(await margins(heading.locator('xpath=following-sibling::p[1]'))).toEqual(['0px', '8px']);
    const list = content(page).locator('.pm-page-content > ul').first();
    expect(await margins(list)).toEqual(['0px', '8px']);
    // Its typography and list metrics: a heading 2 of 20px, text of 12px, a list indented 24pt.
    expect(await css(heading, 'fontSize')).toBe('20px');
    expect(await css(heading.locator('xpath=following-sibling::p[1]'), 'fontSize')).toBe('12px');
    expect(await css(list, 'paddingLeft')).toBe('32px');
  });

  test('DOCE-TEMPLATE-EDITOR-2.1 DOCE-TEMPLATE-EDITOR-2.3 DOCE-TEMPLATE-EDITOR-2.4 renames, moves and deletes a section, the scope following it by name', async ({
    lab,
    page,
  }) => {
    await lab.open('template-editor');
    const settings = panel(page).first();
    const add = settings.getByRole('button', { name: 'Add a section' });
    await add.click();
    const name = settings.getByRole('textbox', { name: 'Section name' });
    await name.fill('Annex A');
    await name.press('Enter');
    await expect(name).toHaveValue('annex_a');
    // Adding from a section adds after it, and a taken name is refused.
    await add.click();
    await name.fill('annex_a');
    await name.press('Enter');
    await expect(settings.getByText('Another section has this name.')).toBeVisible();
    await name.fill('Annex B');
    await name.press('Enter');
    await settings.getByRole('button', { name: 'Move the section earlier' }).click();
    // The scope stays on the moved section.
    await expect(name).toHaveValue('annex_b');
    await page.getByLabel('Show as JSON').check();
    const json = templateJson(page);
    await expect
      .poll(async () => {
        const text = (await json.textContent()) ?? '';
        return [...text.matchAll(/"name": "(annex_\w)"/g)].map((match) => match[1]);
      })
      .toEqual(['annex_b', 'annex_a']);
    await page.getByLabel('Show as JSON').uncheck();
    // Deleting asks first.
    await settings.getByRole('button', { name: 'Delete the section' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('annex_b');
    await dialog.getByRole('button', { name: 'Delete the section' }).click();
    await expect(settings).toHaveAttribute('data-scope', 'document');
    await page.getByLabel('Show as JSON').check();
    await expect(json).not.toContainText('annex_b');
    await expect(json).toContainText('annex_a');
  });

  test('DOCE-TEMPLATE-EDITOR-2.2 edits a host setting in an extension slot', async ({
    lab,
    page,
  }) => {
    await lab.open('template-editor');
    const folder = panel(page).first().getByRole('textbox', { name: 'Folder' });
    await folder.fill('Reports');
    await folder.press('Enter');
    await page.getByLabel('Show as JSON').check();
    await expect(templateJson(page)).toContainText('"folder": "Reports"');
  });

  test('DOCE-TEMPLATE-EDITOR-2.8 scrolls the preview to the section picked', async ({
    lab,
    page,
  }) => {
    await lab.open('template-editor');
    const settings = panel(page).first();
    for (const _ of [1, 2]) await settings.getByRole('button', { name: 'Add a section' }).click();
    await page.getByRole('button', { name: 'Preview the template' }).click();
    const last = content(page).locator('[data-section-name="section_2"]').first();
    await expect(last).toBeInViewport();
    await settings
      .getByRole('group', { name: /^Settings of/ })
      .getByRole('button', { name: /section_2/ })
      .click();
    await page.getByRole('option', { name: 'section_1' }).click();
    await expect(content(page).locator('[data-section-name="section_1"]').first()).toBeInViewport();
  });

  test('DOCE-LABS-3.1 follows the host options', async ({ lab, page }) => {
    await lab.open('template-editor');
    await page.getByLabel('Parent fails to load').check();
    await expect(panel(page)).toContainText('The base template could not be loaded.');
    await page.getByLabel('Disable the template editor').check();
    await expect(panel(page).first().getByRole('textbox', { name: 'Name' })).toBeDisabled();
  });

  test('DOCE-SECTIONS-5.1 DOCE-PAGINATION-8.7 types in headers and footers, in a paragraph and a table cell, on the first and a later page', async ({
    lab,
    page,
  }) => {
    test.slow();
    await lab.open('template-editor');
    // Each region holds a paragraph and a table of two cells.
    await page.getByRole('button', { name: 'Put a table in the header and footer' }).click();
    await expect(regions(page, 'footer').first().locator('td')).toHaveCount(2);
    await expect(page.locator('.de-document-editor')).toHaveAttribute(
      'data-layout-state',
      'settled',
    );
    const later = (await regions(page, 'footer').count()) - 1;
    expect(later).toBeGreaterThan(0);
    for (const kind of ['header', 'footer'] as const) {
      // A paragraph, on a later page and then on the first: every page shows the text.
      await typeInto(page, await clickRegion(page, { kind, page: later }), ' later');
      await typeInto(page, await clickRegion(page, { kind, page: 0 }), ' first');
      await expect
        .poll(() => regionTexts(page, kind))
        .toEqual(Array(later + 1).fill(expect.stringMatching(/ later first/)));
      // A table cell, on the first page and then on a later one.
      const first = await clickRegion(page, { kind, page: 0, block: 'td', last: false });
      await typeInto(page, first, 'Cell one');
      await typeInto(page, await clickRegion(page, { kind, page: later, block: 'td' }), 'Cell two');
      for (const index of [0, later]) {
        for (const value of ['Cell one', 'Cell two']) {
          const cells = regions(page, kind).nth(index).locator('td', { hasText: value });
          await expect(cells).toHaveCount(1);
        }
      }
    }
  });
});
