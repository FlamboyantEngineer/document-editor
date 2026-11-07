import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const pages = (page: Page) => page.locator('.lab-pages .pm-page');

// On each page, how far its content reaches past the room between its header and its footer, and
// past its margins; neither is more than zero on a page that holds its content.
async function overflows(page: Page) {
  return pages(page).evaluateAll((all) =>
    all.map((each) => {
      const style = getComputedStyle(each);
      const box = each.getBoundingClientRect();
      const header = each.querySelector('.pm-page-header')?.getBoundingClientRect();
      const footer = each.querySelector('.pm-page-footer')?.getBoundingClientRect();
      const blocks = [...(each.querySelector('.pm-page-content')?.children ?? [])];
      const first = blocks[0]?.getBoundingClientRect();
      const last = blocks.at(-1)?.getBoundingClientRect();
      if (!header || !footer || !first || !last) return Number.POSITIVE_INFINITY;
      return Math.max(
        header.bottom - first.top,
        last.bottom - footer.top,
        footer.bottom - (box.bottom - parseFloat(style.paddingBottom)),
      );
    }),
  );
}

const footers = (page: Page) => page.locator('.lab-pages .pm-page-footer').allTextContents();
const headers = (page: Page) => page.locator('.lab-pages .pm-page-header').allTextContents();

test.describe('page regions lab', () => {
  test('DOCE-PAGINATION-8.1 leaves each page the room its header and footer take', async ({
    lab,
    page,
  }) => {
    await lab.open('page-regions');
    expect(await pages(page).count()).toBeGreaterThan(2);
    for (const overflow of await overflows(page)) expect(overflow).toBeLessThanOrEqual(1);
    await page.getByLabel('Two-line header').check();
    await expect(page.locator('html')).toHaveAttribute('data-lab-laid-out', 'regions-tall');
    await expect(page.locator('.lab-pages .pm-page-header p').first()).toBeVisible();
    expect(
      await page.locator('.lab-pages .pm-page').first().locator('.pm-page-header p').count(),
    ).toBe(2);
    for (const overflow of await overflows(page)) expect(overflow).toBeLessThanOrEqual(1);
  });

  test("DOCE-PAGINATION-8.2 shows each page's number, the page count and the host's values", async ({
    lab,
    page,
  }) => {
    await lab.open('page-regions');
    const count = await pages(page).count();
    expect(await footers(page)).toEqual(
      Array.from({ length: count }, (_, index) => `Page ${String(index + 1)} of ${String(count)}`),
    );
    expect(new Set(await headers(page))).toEqual(new Set(['Interface requirements']));
    await page.getByLabel('Document name').fill('Timing notes');
    await expect.poll(async () => new Set(await headers(page))).toEqual(new Set(['Timing notes']));
    // A name that wraps makes the header taller, and the pages are laid out with it.
    const long = Array.from({ length: 16 }, () => 'Timing notes').join(' ');
    await page.getByLabel('Document name').fill(long);
    await expect.poll(async () => new Set(await headers(page))).toEqual(new Set([long]));
    await expect.poll(async () => Math.max(...(await overflows(page)))).toBeLessThanOrEqual(1);
  });
});
