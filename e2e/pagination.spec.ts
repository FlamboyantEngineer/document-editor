import { expect, test } from './fixtures.js';

const PAGE_HEIGHT = 360;

test.describe('pagination lab', () => {
  test('DOCE-PAGINATION-5.1 lays a measured document out on pages that hold their content', async ({
    lab,
    page,
  }) => {
    await lab.open('pagination');
    const pages = page.getByRole('region', { name: /^Page \d+$/ });
    expect(await pages.count()).toBeGreaterThan(3);
    const overflow = await page.locator('.lab-page-content').evaluateAll((contents) =>
      contents.map((content) => {
        const children = [...content.children];
        const first = children[0]?.getBoundingClientRect();
        const last = children.at(-1)?.getBoundingClientRect();
        return first && last ? last.bottom - first.top : 0;
      }),
    );
    for (const height of overflow) expect(height).toBeLessThanOrEqual(PAGE_HEIGHT + 1);
  });

  test('DOCE-PAGINATION-5.2 keeps headings with what they head, splits blocks and joins them back whole', async ({
    lab,
    page,
  }) => {
    await lab.open('pagination');
    await expect(page.locator('html')).toHaveAttribute('data-lab-joins-whole', 'true');
    await expect(page.locator('[data-split-part-index="1"]').first()).toBeAttached();
    const heading = page.getByRole('heading', { name: 'Rooms' });
    const headingPage = page.locator('.lab-page').filter({ has: heading });
    await expect(headingPage.locator('ol')).toBeAttached();
  });
});
