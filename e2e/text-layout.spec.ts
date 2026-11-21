import type { Page } from '@playwright/test';
import {
  REGRESSION_DOCUMENTS,
  type RegressionDocumentName,
} from '../labs/src/regression/regression-documents.js';
import type { RegressionProbe } from '../labs/src/regression/regression-probe.js';
import type { StressProbe } from '../labs/src/stress/stress-probe.js';
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

async function open(page: Page, name: RegressionDocumentName, textLayout: 'dom' | 'pretext') {
  await page.goto(`regression.html?document=${name}&textLayout=${textLayout}`);
  await waitForLab(page);
}

// What the pages drew: the forced blocks' computed lines, the guard's faults, the engine's lines
// and the pages overflowing.
const readPages = (page: Page) =>
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
      overflow: [...document.querySelectorAll<HTMLElement>('.pm-page-content')].filter(
        (body) => body.scrollHeight > body.clientHeight + 1,
      ).length,
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
      expect(laid.overflow).toBeLessThanOrEqual(measured.overflow);
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

  test('DOCE-PAGINATION-11.3 gives no computed lines without the option', async ({ page }) => {
    await open(page, 'long-mixed', 'dom');
    expect(await page.evaluate(() => window.regressionLab.textLines())).toEqual([]);
  });
});
