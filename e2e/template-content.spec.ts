import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const content = (page: Page) => page.locator('.de-document-editor__content');
const json = (page: Page) => page.getByLabel('Template JSON');
// The content region of the first section holding a part of a template section.
const part = (page: Page, name: string, which: 'content' | 'placeholder') =>
  content(page)
    .locator(`.pm-section[data-section-name="${name}"][data-template-part="${which}"]`)
    .locator('.pm-page-content')
    .first();
// The template as the lab shows it.
const template = async (page: Page) =>
  JSON.parse((await json(page).textContent()) ?? '{}') as {
    sections: { name: string; content?: unknown; placeholder?: unknown }[];
    header?: { content?: unknown };
  };
const sectionOf = async (page: Page, name: string) =>
  (await template(page)).sections.find((section) => section.name === name);

test.describe('template content lab', () => {
  test('DOCE-SECTIONS-5.2 DOCE-SECTIONS-5.3 DOCE-LABS-3.3 edits section content and placeholder in place', async ({
    lab,
    page,
  }) => {
    await lab.open('template-content');
    // The summary has no content yet: its content part shows the placeholder.
    await expect(part(page, 'summary', 'content').locator('.de-section-placeholder')).toHaveText(
      'Summarise the document.',
    );
    await part(page, 'summary', 'placeholder').locator('p').first().click();
    await page.keyboard.press('End');
    await page.keyboard.type(' Two lines at most.');
    await expect
      .poll(async () => JSON.stringify((await sectionOf(page, 'summary'))?.placeholder))
      .toContain('Summarise the document. Two lines at most.');
    await expect(part(page, 'summary', 'content').locator('.de-section-placeholder')).toHaveText(
      'Summarise the document. Two lines at most.',
    );

    await part(page, 'summary', 'content').locator('p').first().click();
    await page.keyboard.type('Scope and purpose.');
    await expect
      .poll(async () => JSON.stringify((await sectionOf(page, 'summary'))?.content))
      .toContain('Scope and purpose.');

    // The sample is read-only, and Backspace never joins the parts.
    const sample = content(page).locator('.pm-section[data-template-part="sample"] h2').first();
    const before = await sample.textContent();
    await sample.click();
    await page.keyboard.type('xyz');
    await expect(sample).toHaveText(before ?? '');
    await part(page, 'summary', 'placeholder').locator('p').first().click();
    await page.keyboard.press('Home');
    await page.keyboard.press('Backspace');
    await expect(content(page).locator('.pm-section[data-section-name="summary"]')).toHaveCount(2);
  });

  test('DOCE-TEMPLATES-8.5 DOCE-SECTIONS-5.3 inserts a variable from the menu into template content', async ({
    lab,
    page,
  }) => {
    await lab.open('template-content');
    await part(page, 'approvals', 'content').locator('p').first().click();
    await page.keyboard.press('End');
    await page.getByRole('button', { name: 'Variable' }).click();
    await expect(page.getByRole('menuitem', { name: 'Page number' })).toBeVisible();
    await page.getByRole('menuitem', { name: 'Document name' }).click();
    await expect(
      part(page, 'approvals', 'content').locator('[data-template-variable="document.name"]'),
    ).toHaveText('Interface notes');
    await expect
      .poll(async () => JSON.stringify((await sectionOf(page, 'approvals'))?.content))
      .toContain('"key":"document.name"');
  });

  test('DOCE-SECTIONS-5.3 runs the toolbar inside headers and template content', async ({
    lab,
    page,
  }) => {
    await lab.open('template-content');
    // Bold and italic in the header.
    const header = content(page).locator('.pm-page-header p').first();
    await header.click();
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+Home');
    await page.getByRole('button', { name: 'Bold', exact: true }).click();
    await page.getByRole('button', { name: 'Italic', exact: true }).click();
    await expect
      .poll(async () => JSON.stringify((await template(page)).header?.content))
      .toMatch(/"bold".*"italic"|"italic".*"bold"/);

    // A bulleted list and underlined text in a section's starting content.
    const approvals = part(page, 'approvals', 'content');
    await approvals.locator('p').first().click();
    await page.getByRole('button', { name: 'Bulleted list', exact: true }).click();
    await expect
      .poll(async () => JSON.stringify((await sectionOf(page, 'approvals'))?.content))
      .toContain('"bulletList"');
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+Home');
    await page.getByRole('button', { name: 'Underline', exact: true }).click();
    await expect
      .poll(async () => JSON.stringify((await sectionOf(page, 'approvals'))?.content))
      .toContain('"underline"');

    // In the sample, the toolbar offers nothing that edits.
    await content(page)
      .locator('.pm-section[data-template-part="sample"] .pm-page-content p')
      .first()
      .click();
    await expect(page.getByRole('button', { name: 'Bold', exact: true })).toBeDisabled();
  });
});
