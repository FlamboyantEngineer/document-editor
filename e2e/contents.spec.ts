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
        [...each.querySelectorAll('.pm-page-content :is(h1, h2, h3, h4, h5, h6)')].map(
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
    await expect(tables.first()).toContainText('Table 2.1 - Scope limits');
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

  test('DOCE-CONTENTS-2.4 takes the reader to an entry chosen with the keyboard', async ({
    lab,
    page,
  }) => {
    await lab.open('contents');
    await rows(page).first().focus();
    await page.keyboard.press('ArrowDown');
    await expect(rows(page).nth(1)).toBeFocused();
    const name = (await rows(page).nth(1).locator('.de-contents__text').textContent()) ?? '';
    await page.keyboard.press('Enter');
    const heading = await page.evaluate(
      () => document.getSelection()?.anchorNode?.parentElement?.closest('h1, h2')?.textContent,
    );
    expect(heading).toBe(name);
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

  test('DOCE-CONTENTS-1.9 DOCE-CONTENTS-2.11 lists cited documents by group, sorted, wrapped and linked', async ({
    lab,
    page,
  }) => {
    await lab.open('contents');
    const list = page.locator('.lab-pages .de-contents[data-contents-type="references"]');
    const entries = list.locator('.de-contents__entry');
    await expect(entries).toHaveText([
      'Documents',
      'Doe, Jane. (2019). Keeping records. 10.1000/records.',
      /^ABC RG-9 - Retention of records/,
      'XYZ RS-200 A - Records',
      'XYZ RS-200 B - Records',
      'Catalogue',
      'DEF SH-4 - Shelf list',
    ]);
    // A cross-reference inside the document is no cited document.
    await expect(list).not.toContainText('scope');
    const link = entries.nth(4);
    await expect(link).toHaveAttribute('href', 'https://example.com/documents/rs-200');
    await expect(link).toHaveAttribute('target', '_blank');
    // A revision the host gives no address is plain text, as a group's heading is.
    await expect(list.locator('a.de-contents__entry')).toHaveCount(2);
    await expect(entries.nth(3)).not.toHaveAttribute('role');
    // A title too long for its row wraps.
    const long = await entries.nth(2).boundingBox();
    const short = await entries.nth(3).boundingBox();
    expect(long?.height ?? 0).toBeGreaterThan((short?.height ?? 0) * 1.5);
    await expect(entries.locator('.de-contents__page')).toHaveCount(0);
  });

  test('DOCE-TEMPLATES-10.11 nests the levels and sets each in the type the template gives it', async ({
    lab,
    page,
  }) => {
    await lab.open('contents');
    const styles = await rows(page).evaluateAll((all) =>
      all.map((row) => {
        const style = getComputedStyle(row);
        return {
          level: Number((row as HTMLElement).dataset.level),
          indent: Number.parseFloat(style.paddingLeft),
          weight: style.fontWeight,
          italic: style.fontStyle,
          size: Number.parseFloat(style.fontSize),
        };
      }),
    );
    const first = styles.find((row) => row.level === 1);
    const second = styles.find((row) => row.level === 2);
    expect(first).toMatchObject({ weight: '700', italic: 'normal' });
    expect(first?.size).toBeCloseTo((13 * 4) / 3, 1);
    expect(second).toMatchObject({ weight: '400', italic: 'italic' });
    const indents = [1, 2, 3, 4, 5, 6].map(
      (level) => styles.find((row) => row.level === level)?.indent ?? -1,
    );
    expect(indents[0]).toBe(0);
    for (let index = 1; index < 6; index += 1) {
      expect(indents[index]).toBeGreaterThan(indents[index - 1] ?? 0);
    }
  });

  test('DOCE-CONTENTS-2.8 wraps an entry too long for its row and fills each leader to the page', async ({
    lab,
    page,
  }) => {
    await lab.open('contents');
    const long = rows(page).filter({ hasText: 'Archive retention' });
    const shape = await long.evaluate((row) => {
      const text = row.querySelector('.de-contents__text')?.getBoundingClientRect();
      const number = row.querySelector('.de-contents__page')?.getBoundingClientRect();
      const box = row.getBoundingClientRect();
      const line = Number.parseFloat(getComputedStyle(row).lineHeight);
      return {
        lines: (text?.height ?? 0) / line,
        textRight: text?.right ?? Infinity,
        pageRight: number?.right ?? 0,
        right: box.right,
      };
    });
    expect(shape.lines).toBeGreaterThan(1.5);
    expect(shape.textRight).toBeLessThan(shape.pageRight);
    expect(shape.pageRight).toBeLessThanOrEqual(shape.right + 1);
    // Every leader ends against its page number and is never shorter than the room it has.
    const leaders = await rows(page).evaluateAll((all) =>
      all.map((row) => {
        const leader = row.querySelector<HTMLElement>('.de-contents__leader');
        const number = row.querySelector('.de-contents__page')?.getBoundingClientRect();
        const box = leader?.getBoundingClientRect();
        const glyphs = leader
          ? Number.parseFloat(getComputedStyle(leader, '::before').width) || leader.scrollWidth
          : 0;
        return {
          gap: (number?.left ?? 0) - (box?.right ?? 0),
          filled: glyphs >= (box?.width ?? 0) - 1,
        };
      }),
    );
    for (const leader of leaders) {
      expect(leader.filled).toBe(true);
      expect(leader.gap).toBeCloseTo(4, 0);
    }
  });

  test('DOCE-CONTENTS-2.8 copies rows as their text and page, without the leader', async ({
    lab,
    page,
  }) => {
    await lab.open('contents');
    await page.evaluate(() => {
      const editor = document.querySelector<HTMLElement>('.lab-pages .ProseMirror');
      const rows = document.querySelectorAll('.lab-pages .de-contents__entry');
      const [first, second] = rows;
      editor?.focus();
      if (!first || !second) return;
      const range = document.createRange();
      range.setStart(first, 0);
      range.setEnd(second, second.childNodes.length);
      document.getSelection()?.removeAllRanges();
      document.getSelection()?.addRange(range);
      document.addEventListener('copy', (event) => {
        document.body.dataset.copied = event.clipboardData?.getData('text/plain') ?? '';
      });
    });
    await page.keyboard.press('ControlOrMeta+C');
    const copied = await page.evaluate(() => document.body.dataset.copied ?? '');
    expect(copied).toMatch(/^1\. Scope \d+\n1\.1\. Scope conditions \d+$/);
  });
});
