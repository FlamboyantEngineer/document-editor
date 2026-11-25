import type { Page } from '@playwright/test';
import { expect, test, waitForLab } from './fixtures.js';

// Relative sizes and caption fallbacks drawn as the text layout engine resolves them (specs/
// TEMPLATES.md DOCE-TEMPLATES-5.2, specs/PAGINATION.md DOCE-PAGINATION-9.2): with a 150%
// paragraph at 1.5, the paragraph is 18px at a line height of 27px, an unset heading 1 is 2em of it, 36px,
// and unset table, figure and code captions take the paragraph's font at its line height.

async function open(page: Page) {
  await page.goto('regression.html?document=caption-numbering&relativeSizes');
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

test("DOCE-TEMPLATES-5.2 DOCE-PAGINATION-9.2 draws relative sizes against the paragraph's", async ({
  page,
}) => {
  await open(page);
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
