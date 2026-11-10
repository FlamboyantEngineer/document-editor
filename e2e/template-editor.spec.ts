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
});
