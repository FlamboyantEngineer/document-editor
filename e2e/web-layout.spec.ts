import type { Page } from '@playwright/test';
import { BASE_TEMPLATE_ID } from '../src/model/templates/base-template.js';
import { expect, test, waitForLab } from './fixtures.js';

const sections = (page: Page) => page.locator('.lab-content .doc-layout-section');

const columnBoxes = (page: Page) =>
  page.locator('.lab-content .doc-layout-column').evaluateAll((columns) =>
    columns.map((column) => {
      const { left, top, width } = column.getBoundingClientRect();
      return { left, top, width, border: getComputedStyle(column).borderTopColor };
    }),
  );

test.describe('web layout lab', () => {
  test('DOCE-LAYOUT-4.1 applies each configured web margin when other sides are unset', async ({
    page,
  }) => {
    await page.goto('regression.html?layout=web');
    await waitForLab(page);
    await page.evaluate((id) => {
      const section = (name: string, text: string) => ({
        name,
        content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
      });
      window.regressionLab.load(
        {
          formatVersion: 1,
          sections: [section('body', 'Left margin'), section('aside', 'Inherited left margin')],
        },
        {
          formatVersion: 1,
          id,
          page: { margins: { left: '24px' } },
          sections: [{ name: 'aside', page: { margins: { right: '12px' } } }],
        },
      );
    }, BASE_TEMPLATE_ID);
    const pages = page.locator('.lab-document-editor .de-document-editor__content .pm-page');
    const body = pages.filter({ has: page.getByText('Left margin', { exact: true }) });
    const aside = pages.filter({ has: page.getByText('Inherited left margin', { exact: true }) });
    await expect(body).toHaveCSS('padding-left', '24px');
    await expect(body).toHaveCSS('padding-right', '0px');
    await expect(aside).toHaveCSS('padding-left', '24px');
    await expect(aside).toHaveCSS('padding-right', '12px');
    await expect(aside).toHaveCSS('padding-top', '0px');
    await expect(aside).toHaveCSS('padding-bottom', '0px');
  });

  for (const width of [1600, 900]) {
    test(`DOCE-LAYOUT-4.1 fills the surface at ${String(width)} px, inset only by the margins, with columns at their preset widths`, async ({
      lab,
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await lab.open('web-layout');
      await expect(page.locator('.lab-content .pm-page')).toHaveCount(1);
      const surface = await page.locator('.de-document-editor').boundingBox();
      const pageBox = await page.locator('.lab-content .pm-page').boundingBox();
      const content = await page.locator('.lab-content .pm-page-content').boundingBox();
      const title = await page.locator('.de-document-title').boundingBox();
      expect(pageBox?.width).toBeCloseTo(surface?.width ?? 0, 0);
      expect((content?.x ?? 0) - (pageBox?.x ?? 0)).toBeCloseTo(24, 0);
      expect(title?.x).toBeCloseTo(content?.x ?? 0, 0);
      const [summary, detail] = await sections(page)
        .nth(2)
        .locator('.doc-layout-column')
        .evaluateAll((columns) => columns.map((column) => column.getBoundingClientRect().width));
      expect((detail ?? 0) / (summary ?? 1)).toBeGreaterThan(1.8);
      expect((detail ?? 0) / (summary ?? 1)).toBeLessThan(2.2);
    });
  }

  test('DOCE-LAYOUT-4.2 shows column boxes only while authoring, without moving the content', async ({
    lab,
    page,
  }) => {
    await lab.open('web-layout');
    const reading = await columnBoxes(page);
    await expect(page.locator('.lab-content .ProseMirror')).toHaveAttribute(
      'contenteditable',
      'false',
    );
    await page.getByLabel('Authoring').check();
    await expect(page.locator('.lab-content .ProseMirror')).toHaveAttribute(
      'contenteditable',
      'true',
    );
    const authoring = await columnBoxes(page);
    expect(authoring.map(({ left, top, width }) => ({ left, top, width }))).toEqual(
      reading.map(({ left, top, width }) => ({ left, top, width })),
    );
    expect(new Set(reading.map(({ border }) => border))).toEqual(new Set(['rgba(0, 0, 0, 0)']));
    expect(authoring.every(({ border }) => border !== 'rgba(0, 0, 0, 0)')).toBe(true);
  });

  test('DOCE-LAYOUT-4.3 arranges the section holding the caret from the layout controls', async ({
    lab,
    page,
  }) => {
    await lab.open('web-layout');
    await expect(page.getByRole('button', { name: 'Three columns' })).toBeDisabled();
    await page.getByLabel('Authoring').check();
    await page.getByText('Option two').click();
    await expect(page.locator('html')).toHaveAttribute('data-lab-preset', 'halves');
    await page.getByRole('button', { name: 'Three columns' }).click();
    await expect(sections(page).nth(1)).toHaveAttribute('data-layout-preset', 'thirds');
    await expect(sections(page).nth(1).locator('.doc-layout-column')).toHaveCount(3);
    await page.getByRole('button', { name: 'Move section up' }).click();
    await expect(sections(page).nth(0)).toContainText('Option two');
    await page.getByRole('button', { name: 'One column' }).click();
    await expect(sections(page).nth(0)).toHaveAttribute('data-layout-preset', 'single');
    await expect(sections(page).nth(1)).toContainText('Option two');
    await expect(page.locator('html')).toHaveAttribute('data-lab-preset', 'single');
  });
});
