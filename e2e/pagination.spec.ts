import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const PAGE_HEIGHT = 360;

const pages = (page: Page) => page.locator('.lab-pages .pm-page');

// How far each page's blocks reach, from the top of the first to the foot of the last.
async function contentHeights(page: Page): Promise<number[]> {
  return page.locator('.lab-pages .pm-page-content').evaluateAll((contents) =>
    contents.map((content) => {
      const children = [...content.children];
      const first = children[0]?.getBoundingClientRect();
      const last = children.at(-1)?.getBoundingClientRect();
      return first && last ? last.bottom - first.top : 0;
    }),
  );
}

async function expectPagesHoldContent(page: Page) {
  for (const height of await contentHeights(page)) {
    expect(height).toBeLessThanOrEqual(PAGE_HEIGHT + 1);
  }
  await expect(page.locator('html')).toHaveAttribute('data-lab-joins-whole', 'true');
}

test.describe('pagination lab', () => {
  test('DOCE-PAGINATION-5.1 lays a measured document out on pages that hold their content', async ({
    lab,
    page,
  }) => {
    await lab.open('pagination');
    expect(await pages(page).count()).toBeGreaterThan(3);
    await expectPagesHoldContent(page);
  });

  test('DOCE-PAGINATION-5.2 keeps headings with what they head, splits blocks and joins them back whole', async ({
    lab,
    page,
  }) => {
    await lab.open('pagination');
    await expect(page.locator('html')).toHaveAttribute('data-lab-joins-whole', 'true');
    await expect(page.locator('[data-split-part-index="1"]').first()).toBeAttached();
    const heading = page.getByRole('heading', { name: 'Rooms' });
    await expect(pages(page).filter({ has: heading }).locator('ol')).toBeAttached();
  });

  test('DOCE-PAGINATION-6.5 moves the pages onto a new width with the caret on its text', async ({
    lab,
    page,
  }) => {
    await lab.open('pagination');
    const before = await pages(page).count();
    await page
      .locator('.lab-pages')
      .getByText('Room 9:')
      .click({ position: { x: 1, y: 8 } });
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-lab-caret-text', /^Room 9:/);
    await page.getByRole('button', { name: 'Narrow pages' }).click();
    await expect(html).not.toHaveAttribute('data-lab-pages', String(before));
    expect(await pages(page).count()).toBeGreaterThan(before);
    await expect(html).toHaveAttribute('data-lab-caret-text', /^Room 9:/);
    await expectPagesHoldContent(page);
  });

  test('DOCE-PAGINATION-6.6 lays the pages out again as the writer types and undoes', async ({
    lab,
    page,
  }) => {
    await lab.open('pagination');
    const before = await pages(page).count();
    await page
      .locator('.lab-pages')
      .getByText('Room 3:')
      .click({ position: { x: 1, y: 8 } });
    const added = ' More notes were taken here, and kept with the others.'.repeat(6);
    await page.keyboard.type(added, { delay: 0 });
    await expect(page.locator('html')).toHaveAttribute('data-lab-caret-text', /^Room 3:/);
    await expect.poll(() => pages(page).count()).toBeGreaterThanOrEqual(before);
    await expectPagesHoldContent(page);
    const typed = page.locator('.lab-pages').getByText(added.trim().slice(0, 40));
    await expect(typed).toBeVisible();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(typed).toHaveCount(0);
    await expect.poll(() => pages(page).count()).toBe(before);
    await expectPagesHoldContent(page);
  });
});
