import type { Page } from '@playwright/test';
import { expect, test, waitForLab } from './fixtures.js';

// Inline geometry on the engine's lines (specs/PAGINATION.md DOCE-PAGINATION-9.3, 9.6, 11.2,
// 13.1): the regression lab's `inline-geometry` document, whose superscripts, subscripts,
// no-break spaces in justified text, soft hyphens, aligned numbered headings and code beside line
// numbers the pages must draw exactly as the layout engine laid them out.

async function open(page: Page, textLayout: 'dom' | 'pretext') {
  await page.goto(`regression.html?document=inline-geometry&textLayout=${textLayout}&debug`);
  await waitForLab(page);
  if (textLayout === 'pretext') await page.evaluate(() => window.regressionLab.drawAllLines(true));
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

// Where each heading's text starts, by its element id, from the left of its page's content.
const headingStarts = (page: Page) =>
  page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        '.de-document-editor__content .pm-page-content > :is(h1, h2)',
      ),
    ].map((heading) => {
      const text = [...heading.childNodes].find((node) => node.nodeType === Node.TEXT_NODE) ?? null;
      const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
      const first = text ?? walker.nextNode();
      const range = document.createRange();
      range.setStart(first ?? heading, 0);
      range.setEnd(first ?? heading, first ? 1 : 0);
      const content = heading.closest('.pm-page-content')?.getBoundingClientRect().left ?? 0;
      const whole = document.createRange();
      whole.selectNodeContents(heading);
      const tops = new Set([...whole.getClientRects()].map((rect) => Math.round(rect.top)));
      return {
        id: heading.dataset.id,
        tag: heading.tagName,
        left: Math.round(range.getBoundingClientRect().left - content),
        oneLine: tops.size === 1,
      };
    }),
  );

test.describe('inline geometry on the engine’s lines', () => {
  test('DOCE-PAGINATION-9.3 DOCE-PAGINATION-9.6 DOCE-PAGINATION-13.1 draws each block at the height the engine gave it', async ({
    page,
  }) => {
    await open(page, 'pretext');
    expect(await page.evaluate(() => window.regressionLab.wrappedLines())).toEqual([]);
    expect(await offPlan(page)).toEqual([]);
  });

  test('DOCE-PAGINATION-9.3 draws subscripts and superscripts without growing a line, in both modes', async ({
    page,
  }) => {
    await open(page, 'dom');
    expect(await offPlan(page)).toEqual([]);
    const heights = await page.evaluate(() =>
      [...document.querySelectorAll('.pm-page-content sup')]
        .slice(0, 3)
        .map((sup) => getComputedStyle(sup).lineHeight),
    );
    expect(heights).toEqual(['0px', '0px', '0px']);
  });

  test('DOCE-PAGINATION-13.1 starts an aligned numbered heading’s first line before its number', async ({
    page,
  }) => {
    await open(page, 'dom');
    const measured = await headingStarts(page);
    await open(page, 'pretext');
    const laid = await headingStarts(page);
    // A heading on one line in both modes starts where the browser centres or aligns it; a longer
    // one may break a word apart from the browser's line, within the closeness budget.
    const compared = laid.filter(
      (heading) => heading.oneLine && measured.find((each) => each.id === heading.id)?.oneLine,
    );
    // A centred first level and a right-aligned second level.
    expect(new Set(compared.map((heading) => heading.tag))).toEqual(new Set(['H1', 'H2']));
    for (const heading of compared) {
      const left = measured.find((each) => each.id === heading.id)?.left ?? 0;
      expect(Math.abs(heading.left - left), heading.id).toBeLessThanOrEqual(1);
    }
  });

  test('DOCE-PAGINATION-13.1 shows the hyphen at a line that ends at a soft hyphen', async ({
    page,
  }) => {
    await open(page, 'pretext');
    const ends = await page.evaluate(() =>
      [...document.querySelectorAll('.de-forced-lines__hyphen')].map(
        (end) => getComputedStyle(end, '::after').content,
      ),
    );
    expect(ends.length).toBeGreaterThan(3);
    expect(new Set(ends)).toEqual(new Set(['"‐\\a "']));
  });
});
