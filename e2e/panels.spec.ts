import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const navigation = (page: Page) => page.getByRole('region', { name: 'Navigation' });
const ownPanes = (page: Page) => page.getByRole('complementary', { name: 'Panes on their own' });

test.describe('side panels lab', () => {
  test('DOCE-LABS-3.6 follows the host choice of pane and whether the panel shows', async ({
    lab,
    page,
  }) => {
    await lab.open('panels');
    await expect(navigation(page).getByRole('tab', { name: 'Outline' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.getByLabel('Selected pane').selectOption('search');
    await expect(navigation(page).getByRole('tab', { name: 'Search' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await navigation(page).getByRole('tab', { name: 'Outline' }).click();
    await expect(page.getByRole('status', { name: 'Panel report' })).toHaveText('Selected outline');
    await page.getByLabel('Panel expanded').uncheck();
    await expect(navigation(page).getByRole('tabpanel')).toHaveCount(0);
  });

  test('DOCE-SEARCH-2.2 DOCE-SEARCH-3.2 sends the find keys to the panel search pane, and Escape back', async ({
    lab,
    page,
  }) => {
    await lab.open('panels');
    await page.getByLabel('Find keys open the search pane').check();
    await page.getByLabel('Panel expanded').uncheck();
    const document = page.locator('.de-document-editor__content');
    await document.locator('h1', { hasText: 'Timing' }).click();
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+Home');
    await page.keyboard.press('ControlOrMeta+f');
    await expect(navigation(page).getByRole('tab', { name: 'Search' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const query = navigation(page).getByRole('searchbox');
    await expect(query).toBeFocused();
    await expect(query).toHaveValue('Timing');
    await expect(navigation(page).getByRole('option').first()).toBeVisible();
    await expect(page.locator('.de-document-editor__find')).toHaveCount(0);
    // Escape keeps the results, unmarks the matches and takes the writer to the document.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('textbox', { name: 'Sample document' })).toBeFocused();
    await expect(query).toHaveValue('Timing');
    await expect(navigation(page).getByRole('option').first()).toBeVisible();
    await expect(document.locator('[data-search-result]')).toHaveCount(0);
    // Mod-H opens the replace controls with the replacement focused.
    await page.keyboard.press('ControlOrMeta+h');
    await expect(navigation(page).getByRole('textbox', { name: /replace/i })).toBeFocused();
  });

  test('DOCE-LABS-3.6 remembers the panel left to itself across reloads', async ({ lab, page }) => {
    await lab.open('panels');
    await page.getByLabel('Controlled by the host').uncheck();
    await expect(navigation(page).getByRole('tab', { name: 'Search' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await navigation(page).getByRole('tab', { name: 'Properties' }).click();
    await lab.open('panels');
    await page.getByLabel('Controlled by the host').uncheck();
    await expect(navigation(page).getByRole('tab', { name: 'Properties' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('DOCE-EDITOR-8.1 narrows the panel to leave the document the width the host asks', async ({
    lab,
    page,
  }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    await lab.open('panels');
    await page.getByLabel('Controlled by the host').uncheck();
    const handle = navigation(page).getByRole('separator');
    const room = await navigation(page).evaluate(
      (panel) => (panel.parentElement?.clientWidth ?? 0) - 600,
    );
    await expect(handle).toHaveAttribute('aria-valuemax', String(Math.max(200, room)));
  });

  test('DOCE-LABS-3.6 leaves the title out of the outline on its own', async ({ lab, page }) => {
    await lab.open('panels');
    const outline = ownPanes(page).getByRole('navigation', { name: 'Outline' });
    await expect(outline.getByRole('link', { name: /Sample document/ })).toBeVisible();
    await page.getByLabel('Leave out the title').check();
    await expect(outline.getByRole('link', { name: /Sample document/ })).toHaveCount(0);
    await expect(outline.getByRole('link', { name: /Timing/ }).first()).toBeVisible();
  });
});
