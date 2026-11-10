import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const content = (page: Page) => page.locator('.de-document-editor__content');

test.describe('document panels', () => {
  test.beforeEach(async ({ lab, page }) => {
    await lab.open('full-editor');
    await page.getByLabel('Outline and search').check();
  });

  test('DOCE-OUTLINE-2.1 lists the numbered headings and takes the reader to one', async ({
    page,
  }) => {
    const outline = page.getByRole('navigation', { name: 'Document outline' });
    await expect(outline.getByRole('link', { name: '1. Scope', exact: true })).toBeVisible();
    await outline.getByRole('link', { name: '4. Power', exact: true }).click();
    const heading = content(page).locator('h1', { hasText: 'Power' });
    await expect
      .poll(() =>
        heading.evaluate((element) => {
          const viewport = element.closest('.ui-scroll-region__viewport');
          const top = viewport?.getBoundingClientRect().top ?? 0;
          return Math.abs(element.getBoundingClientRect().top - top);
        }),
      )
      .toBeLessThan(120);
  });

  test('DOCE-SEARCH-3.2 lists the matches under their headings and replaces them', async ({
    page,
  }) => {
    const pane = page.locator('.lab-panels');
    await pane.getByRole('searchbox').or(pane.getByRole('textbox')).first().fill('Maintenance');
    const results = pane.getByRole('option');
    await expect(results.first()).toBeVisible();
    await expect(results.first()).toContainText('Scope');
    await results.nth(1).click();
    await expect(content(page).locator('[data-search-match]').first()).toBeVisible();
    await pane
      .getByRole('button', { name: /replace/i })
      .first()
      .click();
    await pane.getByRole('textbox', { name: /replace/i }).fill('Upkeep');
    await pane.getByRole('button', { name: /replace all/i }).click();
    await expect(content(page)).not.toContainText('Maintenance');
    await expect(content(page)).toContainText('Upkeep');
  });
});
