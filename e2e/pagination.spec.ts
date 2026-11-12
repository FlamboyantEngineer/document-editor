import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { expect, test, waitForLab } from './fixtures.js';

const PAGE_HEIGHT = 360;
const NARROW_WIDTH = 300;

const pages = (page: Page) => page.locator('.lab-pages .pm-page');

// How far each page's blocks and footnotes reach, from the top of the first block to the foot of
// the last block or of the footnote area.
async function contentHeights(page: Page): Promise<number[]> {
  return page.locator('.lab-pages .pm-page').evaluateAll((pages) =>
    pages.map((each) => {
      const blocks = [...(each.querySelector('.pm-page-content')?.children ?? [])];
      const notes = each.querySelector('.pm-page-footnotes');
      const first = blocks[0]?.getBoundingClientRect();
      const last = blocks.at(-1)?.getBoundingClientRect();
      const noteHeight = notes?.childElementCount ? notes.getBoundingClientRect().height : 0;
      return first && last ? last.bottom - first.top + noteHeight : 0;
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
    // Every page takes the new width, its footnotes too.
    const widths = await page
      .locator('.lab-pages .pm-page')
      .evaluateAll((all) =>
        all.flatMap((each) =>
          [...each.querySelectorAll(':scope > .pm-page-content, :scope > .pm-page-footnotes')]
            .filter((region) => region.childElementCount > 0)
            .map((region) => Math.round(region.getBoundingClientRect().width)),
        ),
      );
    expect(new Set(widths)).toEqual(new Set([NARROW_WIDTH]));
  });

  test('DOCE-PAGINATION-6.6 DOCE-PAGINATION-7.1 lays the pages out again as the writer types and undoes', async ({
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
    // The pages are laid out again once the writer pauses.
    await expect
      .poll(async () => Math.max(...(await contentHeights(page))))
      .toBeLessThanOrEqual(PAGE_HEIGHT + 1);
    await expectPagesHoldContent(page);
    const typed = page.locator('.lab-pages').getByText(added.trim().slice(0, 40));
    await expect(typed).toBeVisible();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(typed).toHaveCount(0);
    await expect.poll(() => pages(page).count()).toBe(before);
    await expectPagesHoldContent(page);
  });

  test('DOCE-PAGINATION-7.2 puts each footnote on the page that cites it and leaves it room', async ({
    lab,
    page,
  }) => {
    await lab.open('pagination');
    for (const id of ['n1', 'n2']) {
      const citing = pages(page).filter({ has: page.locator(`sup[data-footnote-id="${id}"]`) });
      await expect(citing).toHaveCount(1);
      await expect(citing.locator(`.pm-footnote-entry[data-footnote-id="${id}"]`)).toHaveCount(1);
    }
    await expect(page.locator('.lab-pages .pm-footnote-entry')).toHaveCount(2);
    await expect(page.locator('.lab-pages sup[data-footnote-id="n2"]')).toHaveText('2');
    await expectPagesHoldContent(page);
  });

  test('DOCE-PAGINATION-7.3 keeps the caret in a footnote that moves to another page', async ({
    lab,
    page,
  }) => {
    await lab.open('pagination');
    const entry = page.locator('.lab-pages .pm-footnote-entry[data-footnote-id="n1"]');
    await entry.getByText('The meter').click({ position: { x: 1, y: 6 } });
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-lab-caret-text', /^The meter/);
    const before = await pages(page).count();
    // Pressed without taking the focus, so the writer keeps typing in the footnote.
    await page.getByRole('button', { name: 'Narrow pages' }).dispatchEvent('click');
    await expect(html).not.toHaveAttribute('data-lab-pages', String(before));
    await expect
      .poll(async () => (await html.getAttribute('data-lab-caret-text')) ?? '')
      .toMatch(/^The meter/);
    await page.keyboard.type('Note: ');
    await expect(entry).toContainText('Note: The meter');
  });

  test('DOCE-PAGINATION-7.1 lays the pages out once the writer pauses, not after every key', async ({
    lab,
    page,
  }) => {
    await lab.open('pagination');
    const html = page.locator('html');
    await page
      .locator('.lab-pages')
      .getByText('Room 3:')
      .click({ position: { x: 1, y: 8 } });
    const before = Number(await html.getAttribute('data-lab-layouts'));
    await page.keyboard.type('Twelve keys.', { delay: 20 });
    await expect(html).toHaveAttribute('data-lab-caret-text', /^Room 3:/);
    await expect
      .poll(async () => Number(await html.getAttribute('data-lab-layouts')))
      .toBeGreaterThan(before);
    await page.waitForTimeout(400);
    expect(Number(await html.getAttribute('data-lab-layouts')) - before).toBeLessThanOrEqual(2);
    await expectPagesHoldContent(page);
  });

  test('DOCE-PAGINATION-7.7 tells which page holds the caret from the layout', async ({
    lab,
    page,
  }) => {
    await lab.open('pagination');
    const html = page.locator('html');
    for (const [target, text] of [
      [page.locator('.lab-pages').getByText('Room 9:'), /^Room 9:/],
      [page.locator('.lab-pages .pm-footnote-entry[data-footnote-id="n2"]'), /^The second/],
    ] as const) {
      await target.click({ position: { x: 1, y: 6 } });
      await expect(html).toHaveAttribute('data-lab-caret-text', text);
      const shown = await target.evaluate((element) => {
        const all = [...document.querySelectorAll('.lab-pages .pm-page')];
        return all.findIndex((each) => each.contains(element)) + 1;
      });
      expect(shown).toBeGreaterThan(1);
      await expect(html).toHaveAttribute('data-lab-caret-page', String(shown));
    }
  });

  test('DOCE-PAGINATION-5.6 measures again once a delayed font loads, and the pages hold their content', async ({
    // The lab fixture still collects the page's errors.
    lab: _lab,
    page,
  }) => {
    // A face far larger than its fallback, which the server holds back until the pages are laid out.
    const face = await readFile('node_modules/katex/dist/fonts/KaTeX_Main-Regular.woff2');
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/lab-fonts/delayed.woff2', async (route) => {
      await held;
      await route.fulfill({ body: face, contentType: 'font/woff2' });
    });
    await page.route('**/pagination.html', async (route) => {
      const response = await route.fetch();
      const style =
        '<style>@font-face { font-family: LabDelayed; src: url(lab-fonts/delayed.woff2); size-adjust: 160% }' +
        ' :is(.lab-pages, .lab-measure) p { font-family: LabDelayed, serif !important }</style>';
      await route.fulfill({
        response,
        body: (await response.text()).replace('</head>', `${style}</head>`),
      });
    });
    // The held face holds the page's load event back, so the lab is awaited without it.
    await page.goto('pagination.html', { waitUntil: 'commit' });
    await waitForLab(page);
    const html = page.locator('html');
    const before = Number(await html.getAttribute('data-lab-layouts'));
    const pagesBefore = await pages(page).count();
    release();
    await expect
      .poll(() => page.evaluate(() => document.fonts.check('16px LabDelayed')))
      .toBe(true);
    await expect
      .poll(async () => Number(await html.getAttribute('data-lab-layouts')))
      .toBeGreaterThan(before);
    await expect.poll(() => pages(page).count()).toBeGreaterThan(pagesBefore);
    await expect
      .poll(async () => Math.max(...(await contentHeights(page))))
      .toBeLessThanOrEqual(PAGE_HEIGHT + 1);
    await expectPagesHoldContent(page);
  });
});
