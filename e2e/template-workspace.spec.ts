import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';
import {
  closeCard,
  openCard,
  sectionOf,
  withoutEmptyText,
  writeFields,
} from './template-settings-steps.js';

const workspace = (page: Page) => page.locator('.de-template-workspace');
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Template actions' });
const panel = (page: Page) => page.locator('.de-template-workspace__panel');
const nameField = (page: Page) =>
  page.locator('.de-template-workspace__settings').getByRole('textbox', { name: 'Name' });
const preview = (page: Page) => page.getByRole('region', { name: 'Template preview' });
const settings = (page: Page) => page.locator('.de-template-workspace__settings');
// The preview's first block of a style, on whichever page it lands, and its font size in pixels.
const previewBlock = (page: Page, selector: string) =>
  preview(page).locator(`.pm-page-content > ${selector}`).first();
const fontSizeOf = (page: Page, selector: string) =>
  previewBlock(page, selector).evaluate(
    (element) => Math.round(parseFloat(getComputedStyle(element).fontSize) * 10) / 10,
  );
// Each built-in text style's card, the block that shows it in the preview, and a size for it.
const TEXT_STYLE_SIZES = [
  { card: 'Title', block: 'h1[data-doc-title]', points: 30 },
  ...[1, 2, 3, 4, 5, 6].map((level) => ({
    card: `Heading ${String(level)}`,
    block: `h${String(level)}:not([data-doc-title])`,
    points: 27 - level * 2,
  })),
  { card: 'Paragraph', block: 'p', points: 10.5 },
];
// A colour written as #rrggbb, as the browser computes it.
const rgbOf = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
  return `rgb(${String(r)}, ${String(g)}, ${String(b)})`;
};
const pixels = (points: number) => Math.round(((points * 4) / 3) * 10) / 10;
const saveButton = (page: Page) =>
  toolbar(page).getByRole('button', { name: /^(Save|Saved|Not saved: .*)$/ });

// Shows a pane of the side panel, expanding it from its rail when it is collapsed.
async function showPane(page: Page, name: 'Properties' | 'History') {
  const tab = panel(page).getByRole('tab', { name });
  if (await tab.isVisible()) await tab.click();
  else await panel(page).getByRole('button', { name }).click();
}

async function rename(page: Page, name: string) {
  await showPane(page, 'Properties');
  await nameField(page).fill(name);
  await nameField(page).press('Enter');
}

async function pick(page: Page, name: string) {
  await toolbar(page).getByRole('button', { name: 'Open' }).click();
  const dialog = page.getByRole('dialog', { name: 'Open a template' });
  // The search opens the folders a template sits in.
  await dialog.getByRole('searchbox', { name: 'Search templates' }).fill(name);
  await dialog.getByRole('row', { name: new RegExp(`^${name}`) }).dblclick();
}

test.describe('template workspace lab', () => {
  test('DOCE-TEMPLATE-EDITOR-3.1 DOCE-TEMPLATE-EDITOR-3.2 opens, saves and settles a conflict', async ({
    lab,
    page,
  }) => {
    await lab.open('template-workspace');
    // The side panel starts collapsed to its rail, beside the preview.
    await expect(preview(page).locator('.de-document-editor')).toBeVisible();
    await expect(nameField(page)).toBeHidden();
    await showPane(page, 'Properties');
    await expect(nameField(page)).toHaveValue('Report');
    const save = saveButton(page);
    await expect(save).toBeDisabled();
    await rename(page, 'Annual report');
    await expect(workspace(page)).toHaveAttribute('data-dirty', 'true');
    await save.click();
    await expect(workspace(page)).not.toHaveAttribute('data-dirty', 'true');
    // Another writer saves the template; the next save meets a conflict.
    await page.getByRole('button', { name: 'Save elsewhere' }).click();
    await rename(page, 'Mine');
    await save.click();
    await expect(
      page.getByText('Someone else saved this template since you opened it.'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Reload' }).click();
    await expect(nameField(page)).toHaveValue('Annual report (saved elsewhere)');
    await rename(page, 'Mine');
    await save.click();
    await expect(workspace(page)).not.toHaveAttribute('data-dirty', 'true');
    await expect(nameField(page)).toHaveValue('Mine');
  });

  test('DOCE-TEMPLATE-EDITOR-3.3 DOCE-TEMPLATE-EDITOR-3.5 saves a copy and restores a version', async ({
    lab,
    page,
  }) => {
    await lab.open('template-workspace');
    await toolbar(page).getByRole('button', { name: 'Save as…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Save as a new template' });
    await expect(dialog.getByRole('textbox', { name: 'Id' })).toHaveValue('report_copy');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();
    await showPane(page, 'Properties');
    await expect(nameField(page)).toHaveValue('Copy of Report');
    await pick(page, 'Report');
    await expect(nameField(page)).toHaveValue('Report');
    // The Report template has two saved versions; the older one shows read-only and is restored.
    await showPane(page, 'History');
    const history = page.locator('.de-template-workspace__history');
    await expect(history.getByRole('row')).toHaveCount(2);
    await history.getByRole('row').nth(1).getByRole('button', { name: 'Version actions' }).click();
    await page.getByRole('menuitem', { name: 'View version' }).click();
    await expect(page.getByText('Version 1, read only')).toBeVisible();
    await showPane(page, 'Properties');
    await expect(nameField(page)).toBeDisabled();
    // Restoring stages the version's settings; Save stores them as the newest version.
    await page.getByRole('button', { name: 'Restore this version' }).click();
    await expect(page.getByText('Version 1, read only')).toBeHidden();
    await expect(workspace(page)).toHaveAttribute('data-dirty', 'true');
    await expect(nameField(page)).toBeEnabled();
    await saveButton(page).click();
    await showPane(page, 'History');
    await expect(history.getByRole('row')).toHaveCount(3);
  });

  test('DOCE-TEMPLATE-EDITOR-1.1 DOCE-TEMPLATE-EDITOR-3.2 DOCE-TEMPLATE-EDITOR-3.6 sizes each text style, previews it, and keeps it through a save and reopen', async ({
    lab,
    page,
  }) => {
    // Eight cards set, saved, reopened and checked: about 30 s here, more on a shared CI runner.
    test.setTimeout(180_000);
    await lab.open('template-workspace');
    await showPane(page, 'Properties');
    const styles = sectionOf(settings(page), 'Text styles');
    // Each card's size shows on its block in the preview before anything is saved.
    for (const { card, block, points } of TEXT_STYLE_SIZES) {
      const opened = await openCard(styles, card);
      const size = opened.getByRole('textbox', { name: 'Size', exact: true });
      await size.fill(String(points));
      await size.press('Enter');
      await expect.poll(() => fontSizeOf(page, block), { message: card }).toBe(pixels(points));
      await closeCard(styles, card);
    }
    await saveButton(page).click();
    await expect(workspace(page)).not.toHaveAttribute('data-dirty', 'true');
    // Opened again from the store, each card and block keeps its size.
    await pick(page, 'Letter');
    await expect(nameField(page)).toHaveValue('Letter');
    await pick(page, 'Report');
    await expect(nameField(page)).toHaveValue('Report');
    for (const { card, block, points } of TEXT_STYLE_SIZES) {
      const opened = await openCard(styles, card);
      await expect(opened.getByRole('textbox', { name: 'Size', exact: true })).toHaveValue(
        String(points),
      );
      await expect.poll(() => fontSizeOf(page, block), { message: card }).toBe(pixels(points));
      await closeCard(styles, card);
    }
    // A size cleared goes back to the inherited one, and stays cleared through a save and reopen.
    const title = await openCard(styles, 'Title');
    const titleSize = title.getByRole('textbox', { name: 'Size', exact: true });
    await titleSize.fill('');
    await titleSize.press('Enter');
    await expect(titleSize).not.toHaveAttribute('placeholder', '30');
    const inherited = Number(await titleSize.getAttribute('placeholder'));
    await expect.poll(() => fontSizeOf(page, 'h1[data-doc-title]')).toBe(pixels(inherited));
    await saveButton(page).click();
    await expect(workspace(page)).not.toHaveAttribute('data-dirty', 'true');
    await pick(page, 'Letter');
    await expect(nameField(page)).toHaveValue('Letter');
    await pick(page, 'Report');
    await expect(nameField(page)).toHaveValue('Report');
    await expect(
      (await openCard(styles, 'Title')).getByRole('textbox', { name: 'Size', exact: true }),
    ).toHaveValue('');
    await expect.poll(() => fontSizeOf(page, 'h1[data-doc-title]')).toBe(pixels(inherited));
  });

  test('DOCE-TEMPLATE-EDITOR-1.9 DOCE-TEMPLATE-EDITOR-1.10 DOCE-TEMPLATE-EDITOR-1.11 DOCE-TEMPLATE-EDITOR-3.2 DOCE-TEMPLATE-EDITOR-3.16 writes every field beside the preview, saves it, and reads it back without the samples', async ({
    lab,
    page,
  }) => {
    // About 350 fields, each typed, picked or pressed, the preview following each: about 5 minutes
    // here, 3 to 4 on a CI runner.
    test.setTimeout(900_000);
    // An emptied field inherits, so a template written field by field holds no empty text.
    const fixture = withoutEmptyText(
      JSON.parse(
        readFileSync(
          new URL('../test/fixtures/templates/field-report.json', import.meta.url),
          'utf8',
        ),
      ),
    ) as Record<string, Record<string, Record<string, unknown>>>;
    const leftOut = ['formatVersion', 'id', 'parent', 'sections', 'extensions'];
    await lab.open('template-workspace');
    await showPane(page, 'Properties');
    await writeFields(settings(page), fixture, leftOut);
    // The preview shows the settings before anything is saved.
    const { paragraph, heading1, title } = fixture.styles ?? {};
    await expect
      .poll(() =>
        previewBlock(page, 'p').evaluate((element) => getComputedStyle(element).fontFamily),
      )
      .toContain(String(paragraph?.font));
    await expect
      .poll(() => fontSizeOf(page, 'h1[data-doc-title]'))
      .toBe(pixels(parseFloat(String(title?.size))));
    await expect
      .poll(() =>
        previewBlock(page, 'h1:not([data-doc-title])').evaluate(
          (element) => getComputedStyle(element).color,
        ),
      )
      .toBe(rgbOf(String(heading1?.color)));
    await saveButton(page).click();
    await expect(workspace(page)).not.toHaveAttribute('data-dirty', 'true');
    // Opened again from the store, the template is stored as written, with none of the preview's
    // samples in it.
    await pick(page, 'Letter');
    await expect(nameField(page)).toHaveValue('Letter');
    await pick(page, String(fixture.name));
    await expect(nameField(page)).toHaveValue(String(fixture.name));
    await page.getByRole('button', { name: 'Show the stored template' }).click();
    const text = (await page.getByLabel('Stored template').textContent()) ?? '';
    for (const sample of ['First item', 'Heading 2', 'Each requirement']) {
      expect(text).not.toContain(sample);
    }
    const written = JSON.parse(text) as Record<string, unknown>;
    const expected = structuredClone(fixture) as Record<string, unknown>;
    for (const key of leftOut) {
      delete written[key];
      delete expected[key];
    }
    for (const region of ['header', 'footer'] as const) {
      delete (expected[region] as Record<string, unknown> | undefined)?.content;
      delete (written[region] as Record<string, unknown> | undefined)?.content;
    }
    expect(written).toEqual(expected);
  });

  test('DOCE-TEMPLATE-EDITOR-3.6 DOCE-TEMPLATE-EDITOR-3.7 guards changes and previews a web-layout template', async ({
    lab,
    page,
  }) => {
    await lab.open('template-workspace');
    await rename(page, 'Unsaved');
    await pick(page, 'Article');
    const guard = page.getByRole('alertdialog');
    await expect(guard).toContainText('Changes to Unsaved');
    await guard.getByRole('button', { name: /Stay/ }).click();
    await expect(nameField(page)).toHaveValue('Unsaved');
    await pick(page, 'Article');
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: /Discard/ })
      .click();
    await expect(nameField(page)).toHaveValue('Article');
    await expect(workspace(page)).toHaveAttribute('data-layout', 'web');
    await expect(preview(page).locator('.de-document-editor')).toHaveAttribute(
      'data-layout',
      'web',
    );
  });

  test('DOCE-TEMPLATE-EDITOR-3.10 DOCE-TEMPLATE-EDITOR-3.11 DOCE-TEMPLATE-EDITOR-3.14 edits sections from their tabs and opens templates from folders', async ({
    lab,
    page,
  }) => {
    await lab.open('template-workspace');
    await pick(page, 'Letter');
    const tabs = page.getByRole('tablist', { name: 'Template parts' });
    await expect(tabs.getByRole('tab')).toHaveText(['Document', 'Cover page', 'body']);
    // The band holds the tabs and the actions, in order.
    expect(
      await toolbar(page)
        .getByRole('button')
        .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label'))),
    ).toEqual(['New template', 'Open', 'Save as…', 'Save', 'Delete']);
    await tabs.getByRole('tab', { name: 'body' }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Insert a section before' }).click();
    await expect(tabs.getByRole('tab')).toHaveText(['Document', 'Cover page', 'section_3', 'body']);
    await showPane(page, 'Properties');
    await expect(page.getByRole('region', { name: 'Section settings' })).toBeVisible();
    const add = tabs.locator('..').getByRole('button', { name: 'Add tab' });
    await add.click();
    await expect(add).toBeFocused();
    await expect(tabs.getByRole('tab').last()).toHaveText('section_4');
    // The open dialog: Article pinned first, then the folders; the search reads folder paths.
    await toolbar(page).getByRole('button', { name: 'Open' }).click();
    const dialog = page.getByRole('dialog', { name: 'Open a template' });
    await expect(dialog.getByRole('row').first()).toHaveText('Article');
    await dialog.getByRole('searchbox', { name: 'Search templates' }).fill('mail');
    await expect(dialog.getByRole('row')).toHaveText(['Outgoing', 'Mail', 'Letter']);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
  });

  test('DOCE-TEMPLATES-8.8 DOCE-VERSIONS-2.4 previews nested lists, continued objects and a change bar of each kind', async ({
    lab,
    page,
  }) => {
    await lab.open('template-workspace');
    const shown = preview(page);
    // Each change sample is marked by its kind, the modified one's changed line with its bar.
    const kinds = shown.locator('[data-diff-change]');
    await expect
      .poll(
        async () =>
          new Set(
            await kinds.evaluateAll((all) =>
              all.map((each) => each.getAttribute('data-diff-change')),
            ),
          ),
      )
      .toEqual(new Set(['deletion', 'formatting', 'insertion', 'modification']));
    const line = shown.locator('.de-change-lines__line[data-diff-line="modification"]').first();
    await expect(line).toBeAttached();
    // The bar takes the template's width and its kind's colour (base: 5px, #0000dd).
    expect(
      await line.evaluate((element) => {
        const computed = getComputedStyle(element);
        return [computed.width, computed.backgroundColor];
      }),
    ).toEqual(['5px', 'rgb(0, 0, 221)']);
    await expect(shown.locator('ul ul ul').first()).toBeAttached();
    await expect(shown.locator('.pm-page').nth(1)).toBeAttached();
    // The table goes on over a page break, its header row repeated.
    await expect.poll(() => shown.locator('table').count()).toBeGreaterThan(1);
  });

  test('DOCE-TEMPLATE-EDITOR-3.16 DOCE-TEMPLATE-EDITOR-3.17 previews a section alone and places an image in it', async ({
    lab,
    page,
  }) => {
    await lab.open('template-workspace');
    await pick(page, 'Letter');
    await page
      .getByRole('tablist', { name: 'Template parts' })
      .getByRole('tab', { name: 'Cover page' })
      .click();
    const document = preview(page).getByRole('textbox', { name: 'Template preview document' });
    // The section's content and placeholder, then the sample in its settings.
    await expect
      .poll(() =>
        document
          .locator('[data-template-part]')
          .evaluateAll((all) => all.map((each) => each.getAttribute('data-template-part'))),
      )
      .toEqual(['content', 'placeholder', 'sample']);
    const formatting = preview(page).getByRole('toolbar', { name: 'Formatting' });
    await expect(formatting.getByRole('button', { name: /^Footnote/ })).toHaveCount(0);
    await document.locator('[data-template-part="content"] p').first().click();
    await formatting.getByRole('button', { name: /^Insert image asset/ }).click();
    const picker = page.getByRole('group', { name: 'Insert image asset' });
    await picker.getByRole('row', { name: 'Badge' }).click();
    await picker.getByRole('button', { name: 'Insert' }).click();
    await expect(document.locator('img[data-template-file-id="badge"]').first()).toBeAttached();
    // The image went into the draft, which Save stores.
    await expect(saveButton(page)).toBeEnabled();
  });

  test('DOCE-TEMPLATE-EDITOR-3.11 lays the properties out without overflow or overlap at 300, 420 and 500 pixels', async ({
    lab,
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1400, height: 900 });
    await lab.open('template-workspace');
    await showPane(page, 'Properties');
    const settings = page.locator('.de-template-workspace__settings');
    await expect(nameField(page)).toBeVisible();
    // Every section open, so each row is laid out.
    const closed = settings.locator(
      '.ui-property-section__heading > button[aria-expanded="false"]',
    );
    while ((await closed.count()) > 0) await closed.first().click();
    const separator = panel(page).getByRole('separator');
    for (const width of [300, 420, 500]) {
      // The panel sits at the end edge: dragging its edge left widens it.
      const now = (await panel(page).boundingBox())?.width ?? 0;
      const handle = await separator.boundingBox();
      if (!handle) throw new Error('The panel has no resize handle');
      const x = handle.x + handle.width / 2;
      const y = handle.y + handle.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x - (width - now), y, { steps: 4 });
      await page.mouse.up();
      await expect
        .poll(async () => Math.round((await panel(page).boundingBox())?.width ?? 0))
        .toBeGreaterThanOrEqual(width - 2);
      const problems = await settings.evaluate((root) => {
        const found: string[] = [];
        const box = root.getBoundingClientRect();
        if (root.scrollWidth > root.clientWidth + 1) {
          const wide = [...root.querySelectorAll<HTMLElement>('*')]
            .filter((element) => element.getBoundingClientRect().right > box.right + 1)
            .map(
              (element) =>
                `${element.closest('.ui-property-row')?.textContent?.slice(0, 40) ?? element.className}`,
            );
          found.push(`the settings scroll sideways: ${wide.slice(0, 3).join(', ')}`);
        }
        for (const row of root.querySelectorAll<HTMLElement>('.ui-property-row')) {
          if (row.offsetParent === null) continue;
          const name = row.textContent?.trim().slice(0, 40) ?? '';
          const label = row.querySelector('.ui-property-row__label')?.getBoundingClientRect();
          const control = row.querySelector('.ui-property-row__control')?.getBoundingClientRect();
          if (control && control.right > box.right + 1) found.push(`${name}: control clipped`);
          const overlaps =
            label &&
            control &&
            label.width > 0 &&
            control.width > 0 &&
            label.right > control.left + 1 &&
            control.right > label.left + 1 &&
            label.bottom > control.top + 1 &&
            control.bottom > label.top + 1;
          if (overlaps) found.push(`${name}: label over its control`);
        }
        return found;
      });
      expect(problems, `at ${String(width)} pixels`).toEqual([]);
    }
  });
});
