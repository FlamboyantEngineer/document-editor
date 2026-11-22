import type { Page } from '@playwright/test';
import {
  REGRESSION_DOCUMENTS,
  type RegressionDocumentName,
} from '../labs/src/regression/regression-documents.js';
import type { RegressionProbe } from '../labs/src/regression/regression-probe.js';
import type { StressProbe } from '../labs/src/stress/stress-probe.js';
import { overflowingPages } from './block-geometry.js';
import { drawnNumbers } from './drawn-numbers.js';
import { expect, test, waitForLab } from './fixtures.js';

// The pages laid out and drawn with the text layout engine (specs/PAGINATION.md
// DOCE-PAGINATION-11): each regression document with `textLayout=pretext`, its forced blocks drawn
// on exactly the lines the engine computed, and no page overflowing that does not with the DOM's
// measuring.

declare global {
  interface Window {
    regressionLab: RegressionProbe;
    stressLab: StressProbe;
  }
}

const NAMES = Object.keys(REGRESSION_DOCUMENTS) as RegressionDocumentName[];

// With the layout debugging, whose page room the overflow check reads (DOCE-LABS-8.10), unless
// `plain`: its height labels take the place of generated numbers.
async function open(
  page: Page,
  name: RegressionDocumentName,
  textLayout: 'dom' | 'pretext',
  plain = false,
) {
  await page.goto(
    `regression.html?document=${name}&textLayout=${textLayout}${plain ? '' : '&debug'}`,
  );
  await waitForLab(page);
}

// What the pages drew: the forced blocks' computed lines, the guard's faults, the engine's lines
// and the pages whose content the browser drew past their room.
const readPages = async (page: Page) => ({
  ...(await readLines(page)),
  overflow: await overflowingPages(page),
});

const readLines = (page: Page) =>
  page.evaluate(() => {
    const key = (id: string, part: number) => `${id}#${String(part)}`;
    const computed = new Map(
      window.regressionLab
        .textLines()
        .flatMap((each) => each.blocks)
        .map((block) => [key(block.elementId, block.part), block.lines?.length ?? null]),
    );
    // Only the pages near the screen are drawn on forced lines (DOCE-PAGINATION-11.6).
    const forced = [...document.querySelectorAll<HTMLElement>('.de-forced-lines')].map((block) => {
      const id = key(block.dataset.id ?? '', Number(block.dataset.splitPartIndex ?? 0));
      return { id, drawn: Number(block.dataset.lines), computed: computed.get(id) };
    });
    return {
      forced,
      mismatched: forced.filter((block) => block.drawn !== block.computed),
      wrapped: window.regressionLab.wrappedLines(),
    };
  });

test.describe('the layout engine on the pages', () => {
  for (const name of NAMES) {
    test(`DOCE-PAGINATION-11.2 DOCE-PAGINATION-11.4 draws ${name} on the engine's lines`, async ({
      page,
    }) => {
      await open(page, name, 'dom');
      const measured = await readPages(page);
      expect(measured.forced).toEqual([]);
      await open(page, name, 'pretext');
      const laid = await readPages(page);
      expect(laid.wrapped).toEqual([]);
      expect(laid.mismatched).toEqual([]);
      // Content drawn past its page's room, not the page content's own box, which grows with it
      // (DOCE-LABS-8.10 names each overflow by its fault).
      expect(laid.overflow.length).toBeLessThanOrEqual(measured.overflow.length);
    });
  }

  test('DOCE-PAGINATION-11.1 DOCE-PAGINATION-11.2 keeps a typed paragraph on the engine lines', async ({
    page,
  }) => {
    await open(page, 'long-mixed', 'pretext');
    const before = await page.evaluate(() => {
      const block = window.regressionLab.textLines()[0]?.blocks.find((each) => each.lines);
      return block ? { id: block.elementId, lines: block.lines?.length ?? 0 } : null;
    });
    if (!before) throw new Error('no paragraph on the first page');
    const paragraph = page.locator(`.de-forced-lines[data-id="${before.id}"]`).first();
    await paragraph.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' and some more words to lay out on the lines of this paragraph');
    await page.evaluate(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return window.stressLab.whenSettled();
    });
    const after = await readPages(page);
    expect(after.wrapped).toEqual([]);
    expect(after.mismatched).toEqual([]);
    await expect(paragraph).toContainText('lines of this paragraph');
  });

  test('DOCE-PAGINATION-11.6 draws on forced lines only the pages near the screen', async ({
    page,
  }) => {
    await open(page, 'long-mixed', 'pretext');
    const pages = page.locator('.de-document-editor__content .pm-page');
    // The pages holding forced blocks, by index.
    const forcedPages = () =>
      pages.evaluateAll((all) =>
        all.flatMap((each, index) => (each.querySelector('.de-forced-lines') ? [index] : [])),
      );
    // The last page with a block the engine draws.
    const last = await page.evaluate(() =>
      window.regressionLab
        .textLines()
        .findLastIndex((each) => each.blocks.some((block) => block.lines !== null)),
    );
    expect(last).toBeGreaterThan(10);
    expect(await forcedPages()).not.toContain(last);
    await pages.nth(last).scrollIntoViewIfNeeded();
    await expect.poll(forcedPages).toContain(last);
    // Beside the pages near the end, only the first stays drawn: it holds the caret.
    const far = (await forcedPages()).filter((index) => index > 0 && index < last - 4);
    expect(far).toEqual([]);
    const after = await readPages(page);
    expect(after.wrapped).toEqual([]);
    expect(after.mismatched).toEqual([]);
  });

  test('DOCE-PAGINATION-11.6 draws a page on forced lines before it scrolls into view', async ({
    page,
  }) => {
    await open(page, 'long-mixed', 'pretext');
    // Scrolls the document so a page starts a quarter of a screen below the visible area, and
    // tells whether that page is drawn on forced lines.
    const justBelow = (index: number) =>
      page.evaluate((at) => {
        const scroller = document.querySelector('.ui-scroll-region__viewport');
        const target = document.querySelectorAll('.de-document-editor__content .pm-page')[at];
        if (!scroller || !target) throw new Error('no scroll region or page');
        const below = target.getBoundingClientRect().top - scroller.getBoundingClientRect().bottom;
        scroller.scrollTop += below - scroller.clientHeight / 4;
      }, index);
    const forced = (index: number) =>
      page
        .locator('.de-document-editor__content .pm-page')
        .nth(index)
        .evaluate((each) => Boolean(each.querySelector('.de-forced-lines')));
    // The pages with a block the engine draws, one far down and one back up.
    const engine = await page.evaluate(() =>
      window.regressionLab
        .textLines()
        .flatMap((each, index) => (each.blocks.some((block) => block.lines) ? [index] : [])),
    );
    const far = engine[Math.floor(engine.length * 0.6)] ?? 0;
    const back = engine[Math.floor(engine.length * 0.3)] ?? 0;
    expect(back).toBeGreaterThan(1);
    for (const index of [far, back]) {
      await justBelow(index);
      await expect.poll(() => forced(index), { message: `page ${String(index)}` }).toBe(true);
    }
  });

  test('DOCE-PAGINATION-11.6 snapshots every page on the engine lines', async ({ page }) => {
    await open(page, 'long-mixed', 'pretext');
    const counts = await page.evaluate(() => {
      const html = window.regressionLab.snapshot() ?? '';
      const snapshot = new DOMParser().parseFromString(html, 'text/html');
      const computed = window.regressionLab
        .textLines()
        .flatMap((each) => each.blocks)
        .filter((block) => block.lines !== null).length;
      return {
        computed,
        printed: snapshot.querySelectorAll('.de-forced-lines').length,
        shown: document.querySelectorAll('.de-forced-lines').length,
      };
    });
    expect(counts.printed).toBe(counts.computed);
    expect(counts.shown).toBeLessThan(counts.computed);
  });

  test('DOCE-PAGINATION-11.9 draws every heading, caption and equation number as without the option', async ({
    page,
  }) => {
    await open(page, 'caption-numbering', 'dom', true);
    const measured = await drawnNumbers(page);
    expect(measured.flat()).toContain('Figure 3.1 -');
    await open(page, 'caption-numbering', 'pretext', true);
    expect(await drawnNumbers(page)).toEqual(measured);
  });

  test('DOCE-PAGINATION-11.3 gives no computed lines without the option', async ({ page }) => {
    await open(page, 'long-mixed', 'dom');
    expect(await page.evaluate(() => window.regressionLab.textLines())).toEqual([]);
  });
});

test.describe('served fonts', () => {
  test('DOCE-HOST-1.14.1 DOCE-PAGINATION-12.5 keeps the browser layout and says why when the host serves no shaper', async ({
    page,
  }) => {
    await page.goto('regression.html?document=long-mixed&textLayout=pretext&fonts=none');
    await waitForLab(page);
    const root = page.locator('.de-document-editor').first();
    await expect(root).toHaveAttribute('data-text-layout', 'dom');
    await expect(root).toHaveAttribute('data-text-layout-reason', 'no-shaper');
    await expect(page.locator('.de-forced-lines')).toHaveCount(0);
  });

  test('DOCE-HOST-1.14.2 DOCE-PAGINATION-12.5 draws the pages from the served faces only, never synthesised', async ({
    page,
  }) => {
    await open(page, 'long-mixed', 'pretext');
    const root = page.locator('.de-document-editor').first();
    await expect(root).toHaveAttribute('data-text-layout', 'pretext');
    await expect(root).not.toHaveAttribute('data-text-layout-reason');
    const drawn = await page.evaluate(() => ({
      faces: [...document.fonts]
        .filter((face) => face.family === 'Arial' && face.status === 'loaded')
        .map((face) => `${face.weight} ${face.style}`)
        .sort(),
      synthesis: getComputedStyle(
        document.querySelector('.de-document-editor__content .pm-page-content') ?? document.body,
      ).fontSynthesis,
    }));
    expect(drawn.faces).toEqual(['400 italic', '400 normal', '700 italic', '700 normal']);
    expect(drawn.synthesis).toBe('none');
  });

  test('DOCE-PAGINATION-12.5 draws a generic family the template names as the served family it is measured in', async ({
    page,
  }) => {
    // The regression base template's paragraphs are in `Serif`, its code in the default monospace.
    await open(page, 'long-mixed', 'pretext');
    const family = (selector: string) =>
      page
        .locator(`.de-document-editor__content .pm-page-content ${selector}`)
        .first()
        .evaluate((element) => getComputedStyle(element).fontFamily);
    expect(await family('p')).toBe('"Times New Roman"');
    expect(await family('pre')).toBe('"Courier New"');
  });
});
