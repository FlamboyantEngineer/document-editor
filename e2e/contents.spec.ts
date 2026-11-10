import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const rows = (page: Page) =>
  page.locator('.lab-pages .de-contents[data-contents-type="toc"] .de-contents__entry');

// Each row as its number, text and page.
const listed = (page: Page) =>
  rows(page).evaluateAll((all) =>
    all.map((row) =>
      ['number', 'text', 'page']
        .map((part) => row.querySelector(`.de-contents__${part}`)?.textContent ?? '')
        .join('|'),
    ),
  );

// Each heading of the pages as its text and the page it is on.
const headings = (page: Page) =>
  page
    .locator('.lab-pages .pm-page')
    .evaluateAll((pages) =>
      pages.flatMap((each, index) =>
        [...each.querySelectorAll('.pm-page-content h1, .pm-page-content h2')].map(
          (heading) => `${heading.textContent ?? ''}|${String(index + 1)}`,
        ),
      ),
    );

test.describe('contents lab', () => {
  test('DOCE-CONTENTS-2.1 lists every heading with its number and the page it is on', async ({
    lab,
    page,
  }) => {
    await lab.open('contents');
    const entries = await listed(page);
    expect(entries.slice(0, 3)).toEqual([
      expect.stringMatching(/^1\.\|Scope\|\d+$/),
      expect.stringMatching(/^1\.1\.\|Scope conditions\|\d+$/),
      expect.stringMatching(/^1\.2\.\|Scope responses\|\d+$/),
    ]);
    expect(entries.map((entry) => entry.split('|').slice(1).join('|'))).toEqual(
      await headings(page),
    );
  });

  test('DOCE-CONTENTS-2.2 continues a long list on the next page without its title', async ({
    lab,
    page,
  }) => {
    await lab.open('contents');
    const parts = page.locator('.lab-pages .de-contents[data-contents-type="toc"]');
    await expect(parts).toHaveCount(2);
    await expect(parts.nth(0).locator('.de-contents__title')).toHaveText('Table of Contents');
    await expect(parts.nth(1).locator('.de-contents__title')).toHaveCount(0);
    const first = await page
      .locator('.lab-pages .pm-page')
      .nth(0)
      .locator('.de-contents__entry')
      .count();
    expect(first).toBeGreaterThan(10);
    expect(await rows(page).count()).toBe((await headings(page)).length);
    const overflow = await page.locator('.lab-pages .pm-page').evaluateAll((pages) =>
      pages.map((each) => {
        const content = each.querySelector('.pm-page-content')?.getBoundingClientRect();
        const last = each
          .querySelector('.pm-page-content')
          ?.lastElementChild?.getBoundingClientRect();
        return content && last ? last.bottom - content.bottom : 0;
      }),
    );
    for (const value of overflow) expect(value).toBeLessThanOrEqual(1);
  });

  test('DOCE-CONTENTS-2.3 renumbers the lists when a chapter is inserted before the others', async ({
    lab,
    page,
  }) => {
    await lab.open('contents');
    await page.getByRole('button', { name: 'Insert a chapter at the start' }).click();
    await expect(rows(page).first()).toContainText('1.Inserted chapter 1');
    await expect(rows(page).nth(1)).toContainText('2.Scope');
    const tables = page.locator(
      '.lab-pages .de-contents[data-contents-type="tables"] .de-contents__entry',
    );
    await expect(tables.first()).toContainText('Table 2.1Scope limits');
  });

  test('DOCE-CONTENTS-2.4 takes the reader to the heading an entry names', async ({
    lab,
    page,
  }) => {
    await lab.open('contents');
    await rows(page).filter({ hasText: 'Storage responses' }).click();
    const heading = await page.evaluate(
      () => document.getSelection()?.anchorNode?.parentElement?.closest('h1, h2')?.textContent,
    );
    expect(heading).toBe('Storage responses');
  });

  test('DOCE-CONTENTS-2.5 lists the nodes a configured kind names', async ({ lab, page }) => {
    await lab.open('contents');
    const list = page.locator('.lab-pages .de-contents[data-contents-type="quotes"]');
    await expect(list.locator('.de-contents__title')).toHaveText('Table of Quotations');
    const entries = list.locator('.de-contents__entry');
    await expect(entries).toHaveCount(3);
    await expect(entries.last()).toContainText('“Q”Quoted in chapter 1.');
  });

  test('DOCE-CONTENTS-1.4 orders the entries of a kind and leaves out their pages and leaders', async ({
    lab,
    page,
  }) => {
    await lab.open('contents');
    const entries = page.locator(
      '.lab-pages .de-contents[data-contents-type="quotes"] .de-contents__entry',
    );
    await expect(entries.first()).toContainText('Quoted in chapter 9.');
    await expect(entries.locator('.de-contents__page')).toHaveCount(0);
    await expect(entries.locator('.de-contents__leader')).toHaveCount(0);
  });
});
