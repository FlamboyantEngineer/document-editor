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
    await expect(page.getByLabel('Changes')).toHaveText('5 changes');
    await expect(page.locator('.de-document-editor')).toHaveAttribute('data-comparing', 'markup');
    await expect(block(page, 'shall report each fault')).toHaveAttribute(
      'data-diff-change',
      'modification',
    );
    await expect(block(page, 'shall report each fault').locator('del')).toHaveText(['one']);
    await expect(block(page, 'Each report names')).toHaveAttribute('data-diff-change', 'insertion');
    await expect(block(page, 'Each report names').locator('del[data-diff-block]')).toHaveText(
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
    expect((await bar(page, 'within two seconds')).color).toBe('rgb(0, 0, 221)');
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
});
