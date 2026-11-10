import type { Page } from '@playwright/test';
import { expect, test, waitForLab } from './fixtures.js';

const chrome = (page: Page) => page.getByRole('banner', { name: 'Lab settings' });
const root = (page: Page) => page.locator('html');

/** A computed colour of the first element matching `selector`. */
function colorOf(page: Page, selector: string, property: 'color' | 'background-color') {
  return page
    .locator(selector)
    .first()
    .evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);
}

test.describe('lab chrome', () => {
  test('DOCE-LABS-1.2 tops every lab and the index with a bar that stays in view', async ({
    lab,
    page,
  }) => {
    await lab.open('index');
    await expect(chrome(page).getByText('Labs', { exact: true })).toBeVisible();
    await expect(chrome(page).getByRole('link', { name: 'All labs' })).toHaveCount(0);
    await expect(chrome(page).getByRole('combobox', { name: 'Stylesheet' })).toHaveValue(
      'reference',
    );
    await expect(chrome(page).getByRole('combobox', { name: 'Theme' })).toHaveValue('system');

    await lab.open('pagination');
    await expect(chrome(page).getByText('Pagination', { exact: true })).toBeVisible();
    await expect(chrome(page).getByRole('link', { name: 'All labs' })).toHaveAttribute(
      'href',
      'index.html',
    );
    await page.mouse.wheel(0, 600);
    await expect(async () => {
      expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
      expect((await chrome(page).boundingBox())?.y).toBe(0);
    }).toPass();
  });

  test('DOCE-LABS-1.4 DOCE-LABS-1.5 writes the theme on the root and carries it through the index', async ({
    lab,
    page,
  }) => {
    await lab.open('index');
    await expect(root(page)).toHaveAttribute('data-theme', 'light');
    await chrome(page).getByRole('combobox', { name: 'Theme' }).selectOption('dark');
    await expect(root(page)).toHaveAttribute('data-theme', 'dark');
    await expect(page).toHaveURL(/index\.html\?theme=dark$/);
    const pagination = page
      .getByRole('main')
      .getByRole('link', { name: 'Pagination', exact: true });
    await expect(pagination).toHaveAttribute('href', 'pagination.html?theme=dark');

    await pagination.click();
    await waitForLab(page);
    await expect(root(page)).toHaveAttribute('data-theme', 'dark');
    await expect(chrome(page).getByRole('combobox', { name: 'Theme' })).toHaveValue('dark');
    await expect(chrome(page).getByRole('link', { name: 'All labs' })).toHaveAttribute(
      'href',
      'index.html?theme=dark',
    );
    // The page around the paper follows the theme; the paper stays white with dark text.
    expect(await colorOf(page, 'html', 'background-color')).toBe('rgb(21, 27, 35)');
    expect(await colorOf(page, 'h1', 'color')).toBe('rgb(240, 246, 252)');
    expect(await colorOf(page, '.lab-pages .pm-page', 'background-color')).toBe(
      'rgb(255, 255, 255)',
    );

    // Remembered: a lab opened without the query string keeps the choice.
    await lab.open('templates');
    await expect(root(page)).toHaveAttribute('data-theme', 'dark');
    expect(await colorOf(page, '.lab-pages .pm-page', 'color')).toBe('rgb(17, 24, 39)');
  });

  test('DOCE-LABS-1.4 moves the theme to the chosen root attribute', async ({ lab, page }) => {
    await lab.open('editing');
    await chrome(page).getByRole('combobox', { name: 'Theme' }).selectOption('dark');
    const attribute = chrome(page).getByRole('textbox', { name: 'on' });
    await attribute.fill('data-mode');
    await attribute.press('Enter');
    await expect(root(page)).toHaveAttribute('data-mode', 'dark');
    await expect(root(page)).not.toHaveAttribute('data-theme');
    await expect(page).toHaveURL(/\?theme=dark&themeAttribute=data-mode$/);

    await chrome(page).getByRole('combobox', { name: 'Theme' }).selectOption('custom');
    await chrome(page).getByRole('textbox', { name: 'Theme value' }).fill('night');
    await expect(root(page)).toHaveAttribute('data-mode', 'night');
  });

  test('DOCE-LABS-1.3 unloads the Reference stylesheet for Unstyled and loads it back', async ({
    lab,
    page,
  }) => {
    await lab.open('comments');
    const link = page.locator('link#lab-stylesheet');
    await expect(link).toHaveAttribute('href', 'build/reference.css');
    await expect(root(page)).toHaveAttribute('data-lab-stylesheet-state', 'loaded');
    const stylesheet = chrome(page).getByRole('combobox', { name: 'Stylesheet' });

    await stylesheet.selectOption('none');
    await expect(link).toHaveCount(0);
    await expect(root(page)).toHaveAttribute('data-lab-stylesheet-state', 'none');
    await expect(page).toHaveURL(/\?stylesheet=none$/);
    expect(await colorOf(page, 'html', 'background-color')).toBe('rgba(0, 0, 0, 0)');

    await stylesheet.selectOption('reference');
    await expect(root(page)).toHaveAttribute('data-lab-stylesheet-state', 'loaded');
    await expect(link).toHaveAttribute('href', 'build/reference.css');
    expect(await colorOf(page, 'html', 'background-color')).toBe('rgb(246, 248, 250)');
  });

  test('DOCE-LABS-1.3 loads a custom stylesheet from its URL', async ({ lab, page }) => {
    await lab.open('contents');
    await chrome(page).getByRole('combobox', { name: 'Stylesheet' }).selectOption('custom');
    await chrome(page)
      .getByRole('textbox', { name: 'Stylesheet URL' })
      .fill('reference/document.css');
    await chrome(page).getByRole('button', { name: 'Apply' }).click();
    await expect(page.locator('link#lab-stylesheet')).toHaveAttribute(
      'href',
      'reference/document.css',
    );
    await expect(root(page)).toHaveAttribute('data-lab-stylesheet-state', 'loaded');
    await expect(page).toHaveURL(/\?stylesheet=reference%2Fdocument\.css$/);
  });
});
