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
    // The engine numbers the headings in the template's format (DOCE-PAGINATION-11.9).
    expect(await headingNumber(page)).toBe('"1. " / ""');
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
    expect(await headingNumber(page)).toBe('"A. " / ""');
    const font = await page
      .locator('.lab-pages p')
      .first()
      .evaluate((paragraph) => getComputedStyle(paragraph).fontFamily);
    expect(font).toContain('Georgia');
  });
});

test.describe('template file checks in the templates lab', () => {
  const checks = async (page: Page) =>
    JSON.parse(
      (await page.getByRole('region', { name: 'Template file checks' }).textContent()) ?? 'null',
    ) as Record<string, unknown>;

  test('DOCE-LABS-3.4 DOCE-FORMAT-2.1 DOCE-FORMAT-2.2 DOCE-FORMAT-2.3 DOCE-FORMAT-2.4 DOCE-TEMPLATES-10.1 DOCE-TEMPLATES-10.3 DOCE-TEMPLATES-10.9 reports what is wrong with a template file', async ({
    lab,
    page,
  }) => {
    await lab.open('templates');
    await page.getByRole('button', { name: 'Check the template file' }).click();
    const { errors } = (await checks(page)) as { errors: string[] };
    for (const expected of [
      'template.id must use letters, digits, underscores or hyphens',
      'template.parent must not be the template itself',
      'template.page.size must be one of',
      'template.styles.heading1.numbering.format must be a numbering format',
      'template.header.content: [0]: page_content does not allow image',
      'template.sections[1].content: [0]: unknown node nothing-known',
      'template.styles.custom.9 lives must be named with a letter',
      'template.sections[0].name must use lower-case letters',
      'template.sections[2].name is used by another section',
    ]) {
      expect(errors.some((error) => error.startsWith(expected))).toBe(true);
    }
    await page.getByLabel('Template file (JSON)').fill('{"formatVersion": 7}');
    await page.getByRole('button', { name: 'Check the template file' }).click();
    expect(await checks(page)).toEqual({ errors: ['template.formatVersion must be 1'] });
  });

  test('DOCE-LABS-3.4 DOCE-TEMPLATES-4.2 DOCE-TEMPLATES-10.6 DOCE-TEMPLATES-10.7 reads required sections, missing settings and inherited records', async ({
    lab,
    page,
  }) => {
    await lab.open('templates');
    await page.getByRole('button', { name: 'Check a root template' }).click();
    expect(await checks(page)).toMatchObject({ errors: [], required: ['cover', 'body'] });
    await page.getByRole('button', { name: 'List the missing settings' }).click();
    const missing = await checks(page);
    expect(missing.root).toContain('styles.paragraph.color');
    expect(missing.rootCount).toBeGreaterThan(5);
    expect(missing.resolvedCount).toBe(0);
    await page.getByRole('button', { name: 'Read the inherited records' }).click();
    expect(await checks(page)).toEqual({
      root: { draft: { label: 'Draft' }, final: { label: 'Final' } },
      child: { final: { label: 'Final' }, reviewed: { label: 'Reviewed' } },
    });
  });
});
