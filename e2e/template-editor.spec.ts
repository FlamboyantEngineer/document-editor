import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const panel = (page: Page) =>
  page.getByRole('region', { name: 'Template settings' }).or(page.locator('.de-template-editor'));
const content = (page: Page) => page.locator('.de-document-editor__content');
const style = (page: Page, selector: string, property: string) =>
  content(page)
    .locator(selector)
    .first()
    .evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);

// The landscape segment of the orientation choice.
const landscape = (page: Page) =>
  panel(page)
    .first()
    .getByRole('radio', { name: 'Landscape' })
    .or(panel(page).first().getByRole('button', { name: 'Landscape', exact: true }))
    .first();

test.describe('template editor lab', () => {
  test('DOCE-TEMPLATE-EDITOR-1.1 DOCE-TEMPLATE-EDITOR-1.2 DOCE-LABS-3.1 restyles the document as settings change', async ({
    lab,
    page,
  }) => {
    await lab.open('template-editor');
    const settings = panel(page).first();
    // DOCE-TEMPLATE-EDITOR-1.7: a size in points.
    const size = settings.getByRole('textbox', { name: 'Size' }).first();
    await expect(size).toHaveAttribute('placeholder', /^\d/);
    await size.fill('12');
    await size.press('Enter');
    await expect.poll(() => style(page, 'p', 'font-size')).toBe('16px');
    await size.fill('');
    await size.press('Enter');
    await expect.poll(() => style(page, 'p', 'font-size')).not.toBe('16px');

    await settings.getByRole('button', { name: /Style$/ }).click();
    await page.getByRole('option', { name: 'Heading 1' }).click();
    const colour = settings.getByRole('textbox', { name: 'Colour' }).first();
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
    // DOCE-TEMPLATE-EDITOR-1.5: the JSON holds the section.
    await page.getByLabel('Edit as JSON').check();
    const json = page.getByRole('textbox', { name: 'Template JSON' });
    await expect(json).toContainText('"label": "Appendix"');
    await expect(json).toContainText('"orientation": "landscape"');
  });

  test('DOCE-TEMPLATE-EDITOR-1.4 edits the header content as a document', async ({ lab, page }) => {
    await lab.open('template-editor');
    const settings = panel(page).first();
    await settings.getByRole('button', { name: 'Header content' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'Header content' }).click();
    await page.keyboard.type('Programme review');
    await dialog.getByRole('button', { name: 'Apply' }).click();
    await expect(content(page).locator('.pm-page-header').first()).toContainText(
      'Programme review',
    );
  });

  test('DOCE-TEMPLATE-EDITOR-1.5 edits the template as JSON, checking it as it is typed', async ({
    lab,
    page,
  }) => {
    await lab.open('template-editor');
    await page.getByLabel('Edit as JSON').check();
    const json = page.getByRole('textbox', { name: 'Template JSON' });
    await json.fill(
      '{ "formatVersion": 1, "id": "lab-template", "page": { "orientation": "landscape" } }',
    );
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
    await json.fill('{ "formatVersion": 1, "id": "lab-template", ');
    await expect(page.getByText('The text is not valid JSON.')).toBeVisible();
  });

  test('DOCE-TEMPLATE-EDITOR-1.6 DOCE-TEMPLATES-7.1 adds a custom style and applies it to a paragraph', async ({
    lab,
    page,
  }) => {
    await lab.open('template-editor');
    const settings = panel(page).first();
    await settings.getByRole('button', { name: 'Add a style' }).click();
    const paragraph = content(page).locator('p').nth(2);
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
    await expect(settings.locator('.de-template-editor__field[title]').first()).toHaveAttribute(
      'title',
      /^Inherited from Base template: /,
    );
    // A font typed or picked.
    const font = settings.getByRole('combobox', { name: 'Font' }).first();
    await font.fill('Georgia');
    await expect.poll(() => style(page, 'p', 'font-family')).toContain('Georgia');
    await font.press('Tab');
    // A numbering format keeps only what numbers.
    await settings.getByRole('button', { name: /Style$/ }).click();
    await page.getByRole('option', { name: 'Heading 1' }).click();
    const numbering = settings.getByRole('textbox', { name: 'Numbering format' }).first();
    await numbering.fill('Ab.1x');
    await expect(numbering).toHaveValue('A.1');
    await expect(settings.getByText('1, a, A, i or I for each level').first()).toBeVisible();
    // A heading has no line height of its own.
    await expect(settings.getByRole('textbox', { name: 'Line height' })).toHaveCount(0);
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
    await expect(content(page).locator('table')).toHaveCount(1);
    await expect(content(page).locator('pre')).toHaveCount(1);
    await expect(content(page).locator('[data-section-name]')).not.toHaveCount(0);
  });
});
