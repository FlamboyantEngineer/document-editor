import type { Page } from '@playwright/test';
import { expect, test, waitForLab } from './fixtures.js';

// Relative sizes and caption fallbacks drawn as the text layout engine resolves them (specs/
// TEMPLATES.md DOCE-TEMPLATES-5.2, specs/PAGINATION.md DOCE-PAGINATION-9.2): with a 150%
// paragraph at 1.5, the paragraph is 18px at a line height of 27px, an unset heading 1 is 2em of it, 36px,
// and unset table, figure and code captions take the paragraph's font at its line height, in both
// text layout modes.

async function open(page: Page, textLayout: 'dom' | 'pretext') {
  await page.goto(
    `regression.html?document=caption-numbering&relativeSizes&textLayout=${textLayout}`,
  );
  await waitForLab(page);
}

const readSizes = (page: Page) =>
  page.evaluate(() => {
    const paragraph = document.querySelector('.pm-page-content > p');
    const heading = document.querySelector('.pm-page-content > h1');
    const style = (element: Element | null | undefined, pseudo?: string) => {
      if (!element) return null;
      const computed = getComputedStyle(element, pseudo);
      return {
        family: computed.fontFamily,
        size: computed.fontSize,
        lineHeight: computed.lineHeight,
        weight: computed.fontWeight,
      };
    };
    const caption = (kind: string) => {
      const line = document.querySelector(`.doc-${kind}-caption-line`);
      return {
        text: style(line?.querySelector('.doc-caption-text')),
        label: style(line, '::before'),
      };
    };
    return {
      paragraph: style(paragraph),
      heading: style(heading),
      table: caption('table'),
      figure: caption('figure'),
      code: caption('code'),
    };
  });

for (const textLayout of ['dom', 'pretext'] as const) {
  test(`DOCE-TEMPLATES-5.2 DOCE-PAGINATION-9.2 draws relative sizes against the paragraph's, ${textLayout}`, async ({
    page,
  }) => {
    await open(page, textLayout);
    const sizes = await readSizes(page);
    expect(sizes.paragraph).toMatchObject({ size: '18px', lineHeight: '27px' });
    expect(sizes.heading?.size).toBe('36px');
    for (const kind of ['table', 'figure', 'code'] as const) {
      const { text, label } = sizes[kind];
      expect(text, kind).toEqual({ ...sizes.paragraph, weight: sizes.paragraph?.weight });
      expect(label?.size, kind).toBe('18px');
      expect(label?.family, kind).toBe(sizes.paragraph?.family);
    }
  });
}

test('DOCE-PAGINATION-9.2 draws a 150% paragraph on the engine lines at their line height', async ({
  page,
}) => {
  await open(page, 'pretext');
  // The engine loads lazily; its lines are drawn once it has laid the pages out.
  await expect(page.locator('.pm-page-content > p.de-forced-lines').first()).toBeAttached();
  const heights = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.pm-page-content > p.de-forced-lines')]
      .slice(0, 5)
      .map((block) => block.getBoundingClientRect().height / Number(block.dataset.lines)),
  );
  expect(heights.length).toBeGreaterThan(0);
  for (const height of heights) expect(height).toBeCloseTo(27, 2);
});
