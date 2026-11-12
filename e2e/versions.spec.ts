import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const content = (page: Page) => page.locator('.de-document-editor__content');
const block = (page: Page, text: string) =>
  content(page).locator('.pm-page-content > *', { hasText: text });

async function compareWith(page: Page, version: string) {
  await page.getByRole('complementary').getByText(version, { exact: true }).click();
  await expect(page.getByLabel('Changes')).toContainText('changes');
}

// The color and left edge of a block's change bar, and the block's own left edge.
const bar = (page: Page, text: string) =>
  block(page, text).evaluate((element) => {
    const style = getComputedStyle(element, '::after');
    return {
      color: style.backgroundColor,
      left: Number.parseFloat(style.left),
      width: Number.parseFloat(style.width),
    };
  });

test.describe('versions lab', () => {
  test('DOCE-VERSIONS-2.3 DOCE-VERSIONS-3.1 marks what changed since the version picked', async ({
    lab,
    page,
  }) => {
    await lab.open('versions');
    await compareWith(page, 'Version 1');
    await expect(page.getByLabel('Changes')).toHaveText('7 changes');
    await expect(page.locator('.de-document-editor')).toHaveAttribute('data-comparing', 'markup');
    await expect(block(page, 'shall report each fault')).toHaveAttribute(
      'data-diff-change',
      'modification',
    );
    await expect(block(page, 'shall report each fault').locator('del')).toHaveText(['one']);
    await expect(block(page, 'Each report names')).toHaveAttribute('data-diff-change', 'insertion');
    await expect(block(page, 'Each fault record').locator('del[data-diff-block]')).toHaveText(
      'Operators may clear the log at any time.',
    );
    await expect(block(page, 'Reports go')).toHaveAttribute('data-diff-change', 'move');
    await compareWith(page, 'Version 2');
    await expect(block(page, 'shall report each fault')).not.toHaveAttribute('data-diff-change');
  });

  test('DOCE-VERSIONS-3.2 draws change bars in the template colors beside the blocks', async ({
    lab,
    page,
  }) => {
    await lab.open('versions');
    await compareWith(page, 'Version 1');
    await page.getByLabel('Change bars').check();
    await expect(block(page, 'shall report each fault').locator('del')).toHaveCount(0);
    await expect(content(page).locator('del[data-diff-block]')).toHaveCount(0);
    const inserted = await bar(page, 'Each report names');
    expect(inserted).toEqual({ color: 'rgb(0, 221, 0)', left: -15, width: 5 });
    expect((await bar(page, 'Reports go')).color).toBe('rgb(0, 0, 221)');
  });

  test('DOCE-VERSIONS-3.4 draws a bar beside each line that changed, by its strongest change', async ({
    lab,
    page,
  }) => {
    await lab.open('versions');
    await compareWith(page, 'Version 1');
    await page.getByLabel('Change bars').check();
    // The block's own bar gives way to its lines' bars.
    const record = block(page, 'Each fault record');
    expect(await record.evaluate((element) => getComputedStyle(element, '::after').content)).toBe(
      'none',
    );
    const lines = record.locator('.de-change-lines__line');
    // The blocks deleted before it mark its first line; the replaced words its last.
    await expect(lines).toHaveCount(2);
    const drawn = await lines.evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect();
        return {
          kind: element.getAttribute('data-diff-line'),
          top: box.top,
          bottom: box.bottom,
          color: getComputedStyle(element).backgroundColor,
        };
      }),
    );
    expect(drawn.map(({ kind, color }) => [kind, color])).toEqual([
      ['deletion', 'rgb(221, 0, 0)'],
      ['modification', 'rgb(0, 0, 221)'],
    ]);
    // Successive lines' bars meet.
    expect(Math.abs((drawn[1]?.top ?? 0) - (drawn[0]?.bottom ?? 0))).toBeLessThan(1);
    // A changed word on a one-line block marks its line, in the strongest change's color.
    await expect(
      block(page, 'within two seconds').locator('.de-change-lines__line'),
    ).toHaveAttribute('data-diff-line', 'modification');
  });

  test('DOCE-VERSIONS-3.3 follows edits made while comparing', async ({ lab, page }) => {
    await lab.open('versions');
    await compareWith(page, 'Version 3');
    await expect(page.getByLabel('Changes')).toHaveText('0 changes');
    await block(page, 'The log keeps').click();
    await page.keyboard.press('End');
    await page.keyboard.type(' Always.');
    await expect(page.getByLabel('Changes')).toHaveText('1 changes');
    await expect(block(page, 'The log keeps').locator('[data-diff-change="insertion"]')).toHaveText(
      ' Always.',
    );
  });

  test('DOCE-EDITOR-6.11 tells the host the change bars, measured on their pages', async ({
    lab,
    page,
  }) => {
    await lab.open('versions');
    await expect(
      page
        .getByRole('status', { name: 'Bars reported' })
        .or(page.locator('output[aria-label="Bars reported"]')),
    ).toHaveText('0 bars');
    await compareWith(page, 'Version 1');
    await expect(page.locator('output[aria-label="Bars reported"]')).toHaveText(/^[1-9]\d* bars$/);
  });

  test('DOCE-VERSIONS-3.5 compares any two versions, showing the newer read-only', async ({
    lab,
    page,
  }) => {
    await lab.open('versions');
    const versions = page.getByRole('complementary');
    await versions.getByText('Version 1', { exact: true }).click();
    await versions.getByText('Version 2', { exact: true }).click();
    await page.getByRole('button', { name: /compare/i }).click();
    await expect(page.getByLabel('Showing')).toHaveText('Two versions');
    // Version 2 against Version 1: the edited rule and the bolded words, nothing from Version 3.
    await expect(block(page, 'shall report each fault')).toHaveAttribute(
      'data-diff-change',
      'modification',
    );
    await expect(block(page, 'Reports go')).toHaveAttribute('data-diff-change', 'formatting');
    await expect(block(page, 'Each report names')).toHaveCount(0);
    await expect(page.getByLabel('Changes')).toHaveText('2 changes');
    await expect(content(page).locator('[contenteditable="true"]')).toHaveCount(0);
    await versions.getByText('Version 1', { exact: true }).click();
    await expect(page.getByLabel('Showing')).toHaveText('The document');
    await expect(block(page, 'Each report names')).toHaveCount(1);
  });

  test('DOCE-VERSIONS-2.6 DOCE-VERSIONS-3.6 scopes a comparison to a heading, with counts', async ({
    lab,
    page,
  }) => {
    await lab.open('versions');
    await compareWith(page, 'Version 1');
    await page.getByLabel('Compare within').selectOption('Retention');
    await expect(page.getByLabel('Changes')).toHaveText('1 changes');
    await expect(page.getByLabel('Counts')).toHaveText(
      '0 inserted, 0 deleted, 1 modified, 0 formatted, 0 moved',
    );
    await expect(block(page, 'Records are kept')).toHaveAttribute(
      'data-diff-change',
      'modification',
    );
    const outside = block(page, 'shall report each fault');
    await expect(outside).toHaveAttribute('data-diff-scope', 'outside');
    await expect(outside).not.toHaveAttribute('data-diff-change');
    expect(await outside.evaluate((element) => getComputedStyle(element).opacity)).toBe('0.45');
    await page.getByLabel('Compare within').selectOption('Whole document');
    await expect(page.getByLabel('Changes')).toHaveText('7 changes');
    await expect(content(page).locator('[data-diff-scope]')).toHaveCount(0);
  });
});
