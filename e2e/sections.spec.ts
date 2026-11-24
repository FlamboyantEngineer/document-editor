import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const sections = (page: Page) => page.locator('.de-document-editor__content .pm-section');

// Each section as its name, its page count, and whether its pages are landscape.
const outline = (page: Page) =>
  sections(page).evaluateAll((all) =>
    all.map((section) => {
      const pages = [...section.querySelectorAll(':scope > .pm-page')];
      const box = pages[0]?.getBoundingClientRect();
      const shape = box && box.width > box.height ? 'landscape' : 'portrait';
      return `${section.getAttribute('data-section-name') ?? '-'}|${shape}`;
    }),
  );

test.describe('sections lab', () => {
  test('DOCE-SECTIONS-3.1 lays each section out on pages of its own scope', async ({
    lab,
    page,
  }) => {
    await lab.open('sections');
    await expect.poll(() => outline(page)).toEqual(['-|portrait', 'appendix|landscape']);
    const appendix = sections(page).nth(1);
    await expect(appendix).toHaveAttribute('data-numbering', 'restart');
    await expect(appendix.locator('.pm-page-header').first()).toHaveText('Appendix');
    await expect(sections(page).nth(0).locator('.pm-page-header').first()).toHaveText('');
    const before = await appendix
      .locator('h1')
      .first()
      .evaluate((heading) => getComputedStyle(heading, '::before').content);
    // The appendix restarts its numbering in letters, drawn as the engine numbered it.
    expect(before).toMatch(/^"A\. "/);
    const overflow = await page
      .locator('.de-document-editor__content .pm-page')
      .evaluateAll((pages) =>
        pages.map((each) => {
          const content = each.querySelector('.pm-page-content');
          const last = content?.lastElementChild?.getBoundingClientRect();
          return content && last ? last.bottom - content.getBoundingClientRect().bottom : 0;
        }),
      );
    for (const value of overflow) expect(value).toBeLessThanOrEqual(1);
  });

  test('DOCE-EDITOR-5.4 counts the pages through every section: at the top, a later section’s first page and the last page', async ({
    lab,
    page,
  }) => {
    await lab.open('sections');
    const status = page.locator('.de-document-editor__status-item[data-status="page"]');
    const all = page.locator('.de-document-editor__content .pm-page');
    const total = await all.count();
    const appendix = sections(page).nth(1).locator(':scope > .pm-page');
    // The appendix's first page, counted through the document.
    const first = await all.evaluateAll((each) => {
      const start = document
        .querySelectorAll('.de-document-editor__content .pm-section')[1]
        ?.querySelector(':scope > .pm-page');
      return start ? [...each].indexOf(start as (typeof each)[number]) + 1 : 0;
    });
    expect(first).toBeGreaterThan(1);
    expect(total).toBeGreaterThan(first);
    await expect(status).toHaveText(`Page 1 of ${String(total)}`);
    // The later section's first page filling the window.
    await appendix
      .first()
      .evaluate((sheet) => window.scrollTo(0, sheet.getBoundingClientRect().top + window.scrollY));
    await expect(status).toHaveText(`Page ${String(first)} of ${String(total)}`);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(status).toHaveText(`Page ${String(total)} of ${String(total)}`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(status).toHaveText(`Page 1 of ${String(total)}`);
  });

  test('DOCE-SECTIONS-3.2 ends a page at a page break', async ({ lab, page }) => {
    await lab.open('sections');
    const broken = page
      .locator('.de-document-editor__content .pm-page')
      .filter({ has: page.locator('hr[data-page-break]') });
    await expect(broken).toHaveCount(1);
    await expect(broken.locator('.pm-page-content > :last-child')).toHaveAttribute(
      'data-page-break',
      'manual',
    );
    await expect(broken.locator('h1')).toHaveText(['Scope']);
  });

  test('DOCE-SECTIONS-3.3 starts a section at the caret and joins it back', async ({
    lab,
    page,
  }) => {
    await lab.open('sections');
    await page
      .locator('.de-document-editor__content h2', { hasText: 'Interfaces responses' })
      .click();
    await page.getByRole('button', { name: 'Start an appendix after this block' }).click();
    await expect
      .poll(() => outline(page))
      .toEqual(['-|portrait', 'appendix|landscape', 'appendix|landscape']);
    await page.keyboard.type('Typed ');
    await expect(sections(page).nth(1)).toContainText('Typed Each requirement');
    await page.getByRole('button', { name: 'Join this section with the one before' }).click();
    await expect.poll(() => outline(page)).toEqual(['-|portrait', 'appendix|landscape']);
    await expect(sections(page).nth(0)).toContainText('Typed Each requirement');
  });

  test('DOCE-SECTIONS-3.4 centers every page, portrait or landscape, in one column', async ({
    lab,
    page,
  }) => {
    await lab.open('sections');
    await expect.poll(() => outline(page)).toEqual(['-|portrait', 'appendix|landscape']);
    const boxes = await page
      .locator('.de-document-editor__content .pm-page')
      .evaluateAll((pages) =>
        pages.map((each) => each.getBoundingClientRect().toJSON() as DOMRect),
      );
    const surface = await page.locator('.de-document-editor__content').boundingBox();
    const middle = (surface?.x ?? 0) + (surface?.width ?? 0) / 2;
    expect(new Set(boxes.map((box) => Math.round(box.width))).size).toBe(2);
    for (const [index, box] of boxes.entries()) {
      expect(box.x + box.width / 2).toBeCloseTo(middle, 0);
      const next = boxes[index + 1];
      if (next) expect(next.y - box.bottom).toBeCloseTo(24, 0);
    }
  });

  test('DOCE-SECTIONS-1.3 DOCE-EDITOR-4.7 adds a section from the toolbar, showing its placeholder until written', async ({
    lab,
    page,
  }) => {
    await lab.open('sections');
    const content = page.locator('.de-document-editor__content');
    // The last block of the main section, so the new section starts empty.
    await content.locator('.pm-section').first().locator('.pm-page-content > *').last().click();
    await page
      .getByRole('toolbar', { name: 'Formatting' })
      .getByRole('button', { name: 'Section' })
      .click();
    await page.getByRole('menuitem', { name: 'Summary' }).click();
    const placeholder = content.locator('.de-section-placeholder');
    await expect(placeholder).toHaveText('Summarise the findings.');
    await page.keyboard.type('Results hold.');
    await expect(placeholder).toHaveCount(0);
    await expect(content).toContainText('Results hold.');
  });

  test('DOCE-SECTIONS-3.5 adds a section the document lacks from its button after the pages before it', async ({
    lab,
    page,
  }) => {
    await lab.open('sections');
    const content = page.locator('.de-document-editor__content');
    const add = content.getByRole('button', { name: 'Add Summary' });
    await expect(add).toBeVisible();
    // After the last page of the appendix, the section the template places before the summary.
    const lastPage = content.locator('.pm-section').last().locator('.pm-page').last();
    const [pageBox, buttonBox] = [await lastPage.boundingBox(), await add.boundingBox()];
    expect(buttonBox?.y ?? 0).toBeGreaterThanOrEqual((pageBox?.y ?? 0) + (pageBox?.height ?? 0));
    await expect(content.getByRole('button', { name: 'Add Appendix' })).toHaveCount(0);
    await add.click();
    await expect
      .poll(() => outline(page))
      .toEqual(['-|portrait', 'appendix|landscape', 'summary|portrait']);
    await expect(add).toHaveCount(0);
    await expect(content.locator('.de-section-placeholder')).toHaveText('Summarise the findings.');
  });
});
