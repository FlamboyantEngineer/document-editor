import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const content = (page: Page) => page.locator('.de-document-editor__content');

test.describe('document panels', () => {
  test.beforeEach(async ({ lab }) => {
    await lab.open('full-editor');
  });

  test('DOCE-OUTLINE-2.1 lists the numbered headings and takes the reader to one', async ({
    page,
  }) => {
    const outline = page.getByRole('navigation', { name: 'Outline' });
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
    const pane = page.getByRole('region', { name: 'Navigation' });
    await pane.getByRole('tab', { name: 'Search' }).click();
    await pane.getByRole('searchbox').or(pane.getByRole('textbox')).first().fill('Maintenance');
    const results = pane.getByRole('option');
    await expect(results.first()).toBeVisible();
    await expect(results.first()).toContainText('Scope');
    await results.nth(1).click();
    await expect(content(page).locator('[data-search-result="current"]')).toHaveCount(1);
    await pane
      .getByRole('button', { name: /replace/i })
      .first()
      .click();
    await pane.getByRole('textbox', { name: /replace/i }).fill('Upkeep');
    await pane.getByRole('button', { name: /replace all/i }).click();
    await expect(content(page)).not.toContainText('Maintenance');
    await expect(content(page)).toContainText('Upkeep');
  });

  test('DOCE-EDITOR-4.11 shows side panels: the properties at the caret and the host panes', async ({
    page,
  }) => {
    const details = page.getByRole('region', { name: 'Details' });
    await content(page).locator('h1', { hasText: 'Timing' }).click();
    await expect(details).toContainText('Heading 1');
    await expect(details).toContainText('Portrait');
    await content(page).locator('h1', { hasText: 'Interface limits' }).click();
    await expect(details).toContainText('Appendix');
    await expect(details).toContainText('Landscape');
    // A pane the host adds of its own.
    await details.getByRole('tab', { name: 'Record' }).click();
    await expect(details.getByRole('textbox', { name: 'Title' })).toHaveValue('Sample document');
    // The panels fold away, leaving their launchers.
    await page.getByLabel('Side panels').uncheck();
    await expect(page.getByRole('region', { name: 'Details' })).toHaveCount(0);
  });
});
