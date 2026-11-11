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

test.describe('template editor lab', () => {
  test('DOCE-TEMPLATE-EDITOR-1.1 DOCE-TEMPLATE-EDITOR-1.2 DOCE-LABS-3.1 restyles the document as settings change', async ({
    lab,
    page,
  }) => {
    await lab.open('template-editor');
    const settings = panel(page).first();
    const size = settings.getByRole('textbox', { name: 'Size' }).first();
    await expect(size).toHaveAttribute('placeholder', /px|pt/);
    await size.fill('16px');
    await expect.poll(() => style(page, 'p', 'font-size')).toBe('16px');
    await size.fill('');
    await expect.poll(() => style(page, 'p', 'font-size')).not.toBe('16px');

    await settings.getByRole('button', { name: /Style$/ }).click();
    await page.getByRole('option', { name: 'Heading 1' }).click();
    const colour = settings.getByRole('textbox', { name: 'Colour' }).first();
    await colour.fill('#cc0000');
    await colour.press('Enter');
    await expect.poll(() => style(page, 'h1', 'color')).toBe('rgb(204, 0, 0)');

    await settings.getByRole('button', { name: /Orientation$/ }).click();
    await page.getByRole('option', { name: 'Landscape' }).click();
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
    await settings.getByRole('button', { name: /Orientation$/ }).click();
    await page.getByRole('option', { name: 'Landscape' }).click();
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
});
