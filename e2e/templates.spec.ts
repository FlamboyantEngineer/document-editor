import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const pages = (page: Page) => page.locator('.lab-pages .pm-page');

// Each page's size, and its content's height against the room inside its margins.
async function pageBoxes(page: Page) {
  return pages(page).evaluateAll((all) =>
    all.map((each) => {
      const style = getComputedStyle(each);
      const box = each.getBoundingClientRect();
      const room = box.height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      const blocks = [...(each.querySelector('.pm-page-content')?.children ?? [])];
      const first = blocks[0]?.getBoundingClientRect();
      const last = blocks.at(-1)?.getBoundingClientRect();
      const used = first && last ? last.bottom - first.top : 0;
      return { width: box.width, height: box.height, room, used };
    }),
  );
}

const headingNumber = (page: Page) =>
  page
    .locator('.lab-pages h1')
    .first()
    .evaluate((heading) => getComputedStyle(heading, '::before').content);

test.describe('templates lab', () => {
  test('DOCE-TEMPLATES-5.5 sizes pages by the template and numbers headings by its format', async ({
    lab,
    page,
  }) => {
    await lab.open('templates');
    const boxes = await pageBoxes(page);
    expect(boxes.length).toBeGreaterThan(1);
    for (const box of boxes) {
      expect(box.width).toBeCloseTo((210 * 96) / 25.4, 0);
      expect(box.height).toBeCloseTo((297 * 96) / 25.4, 0);
      expect(box.used).toBeLessThanOrEqual(box.room + 1);
    }
    expect(await headingNumber(page)).toBe('counter(h1) ". "');
  });

  test('DOCE-TEMPLATES-5.6 restyles and lays the pages out again when the template changes', async ({
    lab,
    page,
  }) => {
    await lab.open('templates');
    await page.getByLabel(/Compact/).check();
    await expect(page.locator('html')).toHaveAttribute('data-lab-laid-out', 'compact');
    for (const box of await pageBoxes(page)) {
      expect(box).toMatchObject({ width: 1056, height: 816 });
      expect(box.used).toBeLessThanOrEqual(box.room + 1);
    }
    expect(await headingNumber(page)).toBe('counter(h1, upper-alpha) ". "');
    const font = await page
      .locator('.lab-pages p')
      .first()
      .evaluate((paragraph) => getComputedStyle(paragraph).fontFamily);
    expect(font).toContain('Georgia');
  });
});
