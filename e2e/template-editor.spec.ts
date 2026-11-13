import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, test, waitForLab } from './fixtures.js';
import {
  closeCard,
  openCard,
  sectionOf,
  setField,
  type SettingStep,
  settingSteps,
} from './template-settings-steps.js';

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
    // DOCE-TEMPLATE-EDITOR-1.5: the JSON holds the section.
    await page.getByLabel('Edit as JSON').check();
    const json = page.getByRole('textbox', { name: 'Template JSON' });
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
    await page.getByLabel('Edit as JSON').check();
    await expect(page.getByRole('textbox', { name: 'Template JSON' })).toContainText(
      'Programme review',
    );
  });

  test('DOCE-TEMPLATE-EDITOR-1.5 DOCE-TEMPLATE-EDITOR-2.7 edits the template as JSON, committed once focus leaves', async ({
    lab,
    page,
  }) => {
    await lab.open('template-editor');
    await page.getByLabel('Edit as JSON').check();
    const json = page.getByRole('textbox', { name: 'Template JSON' });
    // The id is locked: the text cannot change it.
    await json.fill(
      '{ "formatVersion": 1, "id": "other", "page": { "orientation": "landscape" } }',
    );
    const pageIsLandscape = () =>
      content(page)
        .locator('.pm-page')
        .first()
        .evaluate(
          (element) =>
            element.getBoundingClientRect().width > element.getBoundingClientRect().height,
        );
    expect(await pageIsLandscape()).toBe(false);
    await json.blur();
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
    await expect(json).toContainText('"id": "lab-template"');
    await json.fill('{ "formatVersion": 1, "id": "lab-template", ');
    await expect(page.getByText('The text is not valid JSON.')).toBeVisible();
    await json.blur();
    await expect(json).toHaveValue('{ "formatVersion": 1, "id": "lab-template", ');
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
    // A font typed or picked.
    const paragraph = await card(page, 'Paragraph');
    const font = paragraph.getByRole('combobox', { name: 'Font' });
    await font.fill('Georgia');
    await expect.poll(() => style(page, 'p', 'font-family')).toContain('Georgia');
    await page.keyboard.press('Tab');
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
    // A numbering format keeps only what numbers.
    const heading = await card(page, 'Heading 1');
    const numbering = heading.getByRole('textbox', { name: 'Numbering', exact: true });
    await numbering.fill('Ab.1x');
    await expect(numbering).toHaveValue('A.1');
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
    await expect(content(page).locator('table')).toHaveCount(1);
    await expect(content(page).locator('pre')).toHaveCount(1);
    await expect(content(page).locator('[data-section-name]')).not.toHaveCount(0);
  });

  test('DOCE-TEMPLATE-EDITOR-1.9 DOCE-TEMPLATE-EDITOR-1.10 DOCE-TEMPLATE-EDITOR-1.11 writes a whole template field by field', async ({
    page,
  }) => {
    // About 350 fields, each typed, picked or pressed: some 2 minutes here, several times that on a
    // shared CI runner.
    test.setTimeout(600_000);
    const fixture = JSON.parse(
      readFileSync(
        new URL('../test/fixtures/templates/field-report.json', import.meta.url),
        'utf8',
      ),
    ) as Record<string, unknown>;
    // What other parts of the editor set: the identity, the sections, the regions' content and
    // the host's extensions.
    const leftOut = ['formatVersion', 'id', 'parent', 'sections', 'extensions'];
    const steps = settingSteps(fixture, [...leftOut, 'name', 'header.content', 'footer.content']);
    // The settings alone: the template is read back from its JSON.
    await page.goto('template-editor.html?document=none');
    await waitForLab(page);
    const settings = panel(page).first();
    await sectionOf(settings, 'Identity')
      .getByRole('textbox', { name: 'Name' })
      .fill(String(fixture.name));
    // Each custom style, added and renamed.
    const styles = sectionOf(settings, 'Custom styles');
    const custom = Object.keys((fixture.styles as { custom: Record<string, unknown> }).custom);
    for (const [index, name] of custom.entries()) {
      await styles.getByRole('button', { name: 'Add a style' }).click();
      const added = await openCard(styles, `style_${String(index + 1)}`);
      const field = added.getByRole('textbox', { name: 'Name' });
      await field.fill(name);
      await field.press('Enter');
      await expect(styles.locator('.ui-property-card__name', { hasText: name })).toHaveCount(1);
    }
    // The steps by section and card, each card open only while its fields are set.
    const groups = new Map<string, SettingStep[]>();
    for (const step of steps) {
      const key = `${step.section}\u0000${step.card ?? ''}`;
      groups.set(key, [...(groups.get(key) ?? []), step]);
    }
    for (const group of groups.values()) {
      const [first] = group;
      if (!first) continue;
      const section = sectionOf(settings, first.section);
      const scope = first.card ? await openCard(section, first.card) : section;
      for (const step of group) await setField(scope, step);
      if (first.card) await closeCard(section, first.card);
    }
    await page.getByLabel('Edit as JSON').check();
    const json = page.getByRole('textbox', { name: 'Template JSON' });
    const written = JSON.parse(await json.inputValue()) as Record<string, unknown>;
    const expected = structuredClone(fixture) as Record<string, Record<string, unknown>>;
    for (const key of leftOut) {
      delete written[key];
      delete expected[key];
    }
    delete expected.header?.content;
    delete expected.footer?.content;
    expect(written).toEqual(expected);
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
    await page.getByLabel('Edit as JSON').check();
    const json = page.getByRole('textbox', { name: 'Template JSON' });
    await expect
      .poll(async () => {
        const text = (await json.inputValue()) || '';
        return [...text.matchAll(/"name": "(annex_\w)"/g)].map((match) => match[1]);
      })
      .toEqual(['annex_b', 'annex_a']);
    await page.getByLabel('Edit as JSON').uncheck();
    // Deleting asks first.
    await settings.getByRole('button', { name: 'Delete the section' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('annex_b');
    await dialog.getByRole('button', { name: 'Delete the section' }).click();
    await expect(settings).toHaveAttribute('data-scope', 'document');
    await page.getByLabel('Edit as JSON').check();
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
    await page.getByLabel('Edit as JSON').check();
    await expect(page.getByRole('textbox', { name: 'Template JSON' })).toContainText(
      '"folder": "Reports"',
    );
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

  test('DOCE-LABS-3.1 DOCE-TEMPLATE-EDITOR-2.7 follows the host options and reports JSON validity', async ({
    lab,
    page,
  }) => {
    await lab.open('template-editor');
    await page.getByLabel('Parent fails to load').check();
    await expect(panel(page)).toContainText('The base template could not be loaded.');
    await page.getByLabel('Edit as JSON').check();
    await page.getByRole('textbox', { name: 'Template JSON' }).fill('{ "formatVersion": 1, ');
    await expect(page.getByRole('status', { name: 'Template report' })).toContainText(
      'JSON invalid',
    );
  });
});
