import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const PAGE_HEIGHT = 360;

const pages = (page: Page) => page.locator('.lab-pages .pm-page');

// Each page's content blocks, with their heights, top margins and line heights, and how far the
// blocks reach from the top of the first.
async function pageSummaries(page: Page) {
  return pages(page).evaluateAll((all) =>
    all.map((each) => {
      const blocks = [...(each.querySelector('.pm-page-content')?.children ?? [])];
      const first = blocks[0]?.getBoundingClientRect();
      const last = blocks.at(-1)?.getBoundingClientRect();
      const style = (block: Element | undefined) => (block ? getComputedStyle(block) : null);
      return {
        height: first && last ? last.bottom - first.top : 0,
        blocks: blocks.map((block) => ({
          tag: block.tagName.toLowerCase(),
          text: block.textContent ?? '',
          height: block.getBoundingClientRect().height,
          marginTop: Number.parseFloat(style(block)?.marginTop ?? '0'),
          lineHeight: Number.parseFloat(style(block)?.lineHeight ?? '0'),
        })),
      };
    }),
  );
}

test.describe('layout rules lab', () => {
  test('DOCE-PAGINATION-2.5 DOCE-PAGINATION-5.2 never ends a page with a heading, and moves one with a paragraph that cannot split', async ({
    lab,
    page,
  }) => {
    await lab.open('layout-rules');
    await expect(page.locator('html')).toHaveAttribute('data-lab-joins-whole', 'true');
    const summaries = await pageSummaries(page);
    expect(summaries.length).toBeGreaterThan(8);
    for (const summary of summaries) {
      expect(summary.height).toBeLessThanOrEqual(PAGE_HEIGHT + 1);
      expect(summary.blocks.at(-1)?.tag).not.toMatch(/^h\d$/);
    }
    // A heading that started a page although it, its gap and its paragraph's first line fitted on
    // the page before: its paragraph could not split there, so it moved with it.
    const moved = summaries.filter((summary, index) => {
      const [title, lead] = summary.blocks;
      const before = summaries[index - 1];
      if (!title?.text.startsWith('Finding') || !lead || !before) return false;
      const room = PAGE_HEIGHT - 2 - before.height - title.marginTop;
      return title.height + lead.marginTop + lead.lineHeight <= room;
    });
    expect(moved.length).toBeGreaterThan(0);
    const tables = page.locator('.lab-pages .pm-page').filter({
      has: page.getByRole('heading', { name: /^Table / }),
    });
    for (const each of await tables.all()) await expect(each.locator('table')).toBeAttached();
  });

  test('DOCE-PAGINATION-4.6 DOCE-PAGINATION-4.7 splits a script block’s output and a layout section’s columns across pages', async ({
    lab,
    page,
  }) => {
    await lab.open('layout-rules');
    await expect(page.locator('html')).toHaveAttribute('data-lab-joins-whole', 'true');
    const scripts = page.locator('.lab-pages .script-block');
    expect(await scripts.count()).toBeGreaterThan(1);
    await expect(scripts.nth(1)).toHaveAttribute('data-split-part-index', '1');
    const sections = page.locator('.lab-pages .doc-layout-section');
    expect(await sections.count()).toBeGreaterThan(1);
    await expect(sections.nth(1)).toHaveAttribute('data-split-part-index', '1');
    await expect(sections.nth(1).locator('.doc-layout-column')).toHaveCount(2);
  });

  test('DOCE-PAGINATION-5.2 lays a host node type out by its own measure, split and join', async ({
    lab,
    page,
  }) => {
    await lab.open('layout-rules');
    await expect(page.locator('html')).toHaveAttribute('data-lab-joins-whole', 'true');
    const logs = page.locator('.lab-pages .lab-log');
    expect(await logs.count()).toBeGreaterThan(1);
    await expect(page.locator('.lab-pages .lab-log li')).toHaveCount(30);
    const second = await logs.nth(1).locator('ol').getAttribute('start');
    const firstCount = await logs.nth(0).locator('li').count();
    expect(Number(second)).toBe(firstCount + 1);
  });
});
