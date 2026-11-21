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
    const forced = [...document.querySelectorAll<HTMLElement>('.de-forced-lines')];
    const computed = window.regressionLab
      .textLines()
      .flatMap((each) => each.blocks)
      .filter((block) => block.lines !== null);
    return {
      forced: forced.map((block) => Number(block.dataset.lines)),
      computed: computed.map((block) => block.lines?.length ?? 0),
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
      expect(laid.forced).toEqual(laid.computed);
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
    expect(after.forced).toEqual(after.computed);
    await expect(paragraph).toContainText('lines of this paragraph');
  });

  test('DOCE-PAGINATION-11.3 gives no computed lines without the option', async ({ page }) => {
    await open(page, 'long-mixed', 'dom');
    expect(await page.evaluate(() => window.regressionLab.textLines())).toEqual([]);
  });
});
