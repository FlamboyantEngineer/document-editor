import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const document = (page: Page) => page.locator('.de-document-editor__content');
const pane = (page: Page) => page.getByRole('region', { name: 'Contributors' });

// The distinct values of an attribute over the elements a selector finds.
async function distinct(page: Page, selector: string, attribute: string) {
  const values = await page
    .locator(selector)
    .evaluateAll(
      (elements, name) => elements.map((element) => element.getAttribute(name)),
      attribute,
    );
  return new Set(values).size;
}

test.describe('contributor colours lab', () => {
  test('DOCE-LABS-3.11 DOCE-COLLAB-1.8 gives twelve writers colours of their own with 50 slots, and shares 8', async ({
    lab,
    page,
  }) => {
    await lab.open('contributor-colors');
    await expect(pane(page).getByRole('listitem')).toHaveCount(12);
    await expect(document(page).locator('.de-presence-caret')).toHaveCount(12);
    expect(
      await distinct(page, '.de-document-editor__content [data-author-slot]', 'data-author-slot'),
    ).toBe(12);
    expect(await distinct(page, '.de-presence-caret', 'data-presence-slot')).toBe(12);
    expect(await distinct(page, '.de-document-contributors__contributor', 'data-author-slot')).toBe(
      12,
    );
    // Each writer's tint is a colour of its own.
    const tints = await document(page)
      .locator('[data-author-slot]')
      .evaluateAll((elements) =>
        elements.map((element) => getComputedStyle(element).backgroundColor),
      );
    expect(new Set(tints).size).toBe(12);
    await page.getByLabel('Colour slots').selectOption('8');
    await expect.poll(() => distinct(page, '.de-presence-caret', 'data-presence-slot')).toBe(8);
    expect(
      await distinct(page, '.de-document-editor__content [data-author-slot]', 'data-author-slot'),
    ).toBe(8);
  });
});
