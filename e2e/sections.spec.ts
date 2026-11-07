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
    expect(before).toContain('upper-alpha');
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
});
