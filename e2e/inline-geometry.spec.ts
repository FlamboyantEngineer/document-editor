import type { Page } from '@playwright/test';
import { expect, test, waitForLab } from './fixtures.js';

// Inline geometry on the engine's lines (specs/PAGINATION.md DOCE-PAGINATION-9.3, 9.6, 11.2,
// 13.1): the regression lab's `inline-geometry` document, whose superscripts, subscripts,
// no-break spaces in justified text, soft hyphens, aligned numbered headings and code beside line
// numbers the pages must draw exactly as the layout engine laid them out.

async function open(page: Page) {
  await page.goto('regression.html?document=inline-geometry&textLayout=pretext&debug');
  await waitForLab(page);
  await page.evaluate(() => window.regressionLab.drawAllLines(true));
}

// Each block of the pages whose drawn height is not the one the layout gave it. Code figures are
// left out: their caption line is drawn below the height packed in both modes (Q4, finding V2).
const offPlan = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.pm-page-content > [data-debug-height]')]
      .filter((block) => block.dataset.debugType !== 'code_figure')
      .map((block) => ({
        type: block.dataset.debugType,
        id: block.dataset.id,
        planned: Number(block.dataset.debugHeight),
        drawn: Math.round(block.getBoundingClientRect().height * 1000) / 1000,
      }))
      .filter((block) => Math.abs(block.drawn - block.planned) > 0.5),
  );

// Each heading on one line: where its number starts (its first-line indent), and the room left
// after its text, from its page's content edges. Both sides are equal when it is centred, and the
// second is nothing when it is right-aligned.
const headingGaps = (page: Page) =>
  page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        '.de-document-editor__content .pm-page-content > :is(h1, h2)',
      ),
    ].flatMap((heading) => {
      const whole = document.createRange();
      whole.selectNodeContents(heading);
      const rects = [...whole.getClientRects()];
      if (new Set(rects.map((rect) => Math.round(rect.top))).size !== 1) return [];
      const content = heading.closest('.pm-page-content')?.getBoundingClientRect();
      const indent = parseFloat(getComputedStyle(heading).getPropertyValue('--de-first-indent'));
      return [
        {
          id: heading.dataset.id,
          tag: heading.tagName,
          before: Number.isNaN(indent) ? 0 : indent,
          after: (content?.right ?? 0) - Math.max(...rects.map((rect) => rect.right)),
        },
      ];
    }),
  );

test.describe('inline geometry on the engine’s lines', () => {
  test('DOCE-PAGINATION-9.3 DOCE-PAGINATION-9.6 DOCE-PAGINATION-13.1 draws each block at the height the engine gave it', async ({
    page,
  }) => {
    await open(page);
    expect(await page.evaluate(() => window.regressionLab.wrappedLines())).toEqual([]);
    expect(await offPlan(page)).toEqual([]);
  });

  test('DOCE-PAGINATION-9.3 draws subscripts and superscripts without growing a line', async ({
    page,
  }) => {
    await open(page);
    const heights = await page.evaluate(() =>
      [...document.querySelectorAll('.de-document-editor__content .pm-page-content sup')]
        .slice(0, 3)
        .map((sup) => getComputedStyle(sup).lineHeight),
    );
    expect(heights).toEqual(['0px', '0px', '0px']);
  });

  test('DOCE-PAGINATION-13.1 starts an aligned numbered heading’s first line before its number', async ({
    page,
  }) => {
    await open(page);
    const headings = await headingGaps(page);
    // A centred first level and a right-aligned second level.
    expect(new Set(headings.map((heading) => heading.tag))).toEqual(new Set(['H1', 'H2']));
    for (const heading of headings) {
      const { id, before, after } = heading;
      if (heading.tag === 'H1') expect(Math.abs(before - after), id).toBeLessThanOrEqual(1);
      else expect(Math.abs(after), id).toBeLessThanOrEqual(1);
      expect(before, id).toBeGreaterThan(0);
    }
  });

  test('DOCE-PAGINATION-13.1 shows the hyphen at a line that ends at a soft hyphen', async ({
    page,
  }) => {
    await open(page);
    const ends = await page.evaluate(() =>
      [...document.querySelectorAll('.de-forced-lines__hyphen')].map(
        (end) => getComputedStyle(end, '::after').content,
      ),
    );
    expect(ends.length).toBeGreaterThan(3);
    expect(new Set(ends)).toEqual(new Set(['"‐\\a "']));
  });
});
