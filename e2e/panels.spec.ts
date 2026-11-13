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

  test('DOCE-LABS-3.6 leaves the title out of the outline on its own', async ({ lab, page }) => {
    await lab.open('panels');
    const outline = ownPanes(page).getByRole('navigation', { name: 'Outline' });
    await expect(outline.getByRole('link', { name: /Sample document/ })).toBeVisible();
    await page.getByLabel('Leave out the title').check();
    await expect(outline.getByRole('link', { name: /Sample document/ })).toHaveCount(0);
    await expect(outline.getByRole('link', { name: /Timing/ }).first()).toBeVisible();
  });
});
