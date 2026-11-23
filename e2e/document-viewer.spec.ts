import type { Page } from '@playwright/test';
import type { RegressionDocumentName } from '../labs/src/regression/regression-documents.js';
import type { RegressionProbe } from '../labs/src/regression/regression-probe.js';
import type { StressProbe } from '../labs/src/stress/stress-probe.js';
import { readDrawnLines, readDrawnPages } from './drawn-lines.js';
import { expect, test, waitForLab } from './fixtures.js';

// The read-only viewer (specs/PAGINATION.md DOCE-PAGINATION-13.6): the pages' layout drawn without
// the editor shows every page the engine computed, each forced block on the engine's lines, draws
// only the pages near the viewport, and numbers a page drawn on its own on from the pages before.

declare global {
  interface Window {
    regressionLab: RegressionProbe;
    stressLab: StressProbe;
  }
}

const NAMES: readonly RegressionDocumentName[] = [
  'long-mixed',
  'heading-keep-with-next',
  'mixed-geometry-repeated-sections',
  'footnote-heavy',
  'long-ordered-list',
];

const VIEWER = '.de-document-viewer';
const SHEETS = `${VIEWER} .pm-page`;

// Spaces as the stored text holds them: a no-break space a browser kept at a writer's edge is a space.
const plain = (text: string) => text.replaceAll(' ', ' ');

async function open(page: Page, name: RegressionDocumentName, rendering = 'dom') {
  await page.goto(`regression.html?document=${name}&textLayout=pretext&rendering=${rendering}`);
  await waitForLab(page);
  await page.evaluate(async () => {
    await document.fonts.ready;
    return window.stressLab.whenSettled();
  });
}

async function showViewer(page: Page, overscan?: number) {
  expect(await page.evaluate((each) => window.regressionLab.showViewer(each), overscan)).toBe(true);
  await expect(page.locator(SHEETS).first()).toBeAttached();
}

// The computed lines of each forced block, by page, and the lines the viewer draws for each.
async function linesAgainstComputed(page: Page) {
  const computed = await page.evaluate(() => window.regressionLab.textLines());
  const asked = computed.flatMap(({ blocks }, index) =>
    blocks.flatMap((block) =>
      block.lines
        ? [{ page: index, elementId: block.elementId, part: block.part, lines: block.lines }]
        : [],
    ),
  );
  const drawn = await readDrawnLines(page, asked, 'viewer');
  const mismatches = asked.flatMap((block, index) => {
    const lines = block.lines.map((line) => plain(line.text));
    const own = drawn[index]?.map(plain) ?? null;
    const same = own?.length === lines.length && own.every((text, at) => text === lines[at]);
    return same ? [] : [{ page: block.page, block: block.elementId, computed: lines, drawn: own }];
  });
  return { computed, mismatches };
}

test.describe('the read-only viewer', () => {
  for (const name of NAMES) {
    test(`DOCE-PAGINATION-13.6 draws ${name} on the computed pages and lines`, async ({ page }) => {
      await open(page, name);
      await showViewer(page);
      const { computed, mismatches } = await linesAgainstComputed(page);
      const pages = await readDrawnPages(page, '.de-forced-lines', 'viewer');
      expect(pages.pages).toBe(computed.length);
      expect(pages.forced).toEqual(
        computed.map(({ blocks }) =>
          blocks
            .filter((block) => block.lines !== null)
            .map((block) => `${block.elementId}#${String(block.part)}`),
        ),
      );
      expect(mismatches).toEqual([]);
    });
  }

  test('DOCE-PAGINATION-13.6 draws the same pages as HTML beside pages painted into canvases', async ({
    page,
  }) => {
    await open(page, 'long-mixed', 'html-canvas');
    await showViewer(page);
    const { computed, mismatches } = await linesAgainstComputed(page);
    expect((await readDrawnPages(page, '.de-forced-lines', 'viewer')).pages).toBe(computed.length);
    expect(mismatches).toEqual([]);
    await expect(page.locator(`${VIEWER} canvas`)).toHaveCount(0);
  });

  test('DOCE-PAGINATION-13.6 draws only the pages near the viewport', async ({ page }) => {
    await open(page, 'long-mixed');
    await showViewer(page, 1);
    const sheets = page.locator(SHEETS);
    const total = await sheets.count();
    expect(total).toBeGreaterThan(4);
    await expect(sheets.first()).toHaveAttribute('data-drawn', 'true');
    await expect(sheets.last()).not.toHaveAttribute('data-drawn');
    // Every sheet keeps its page's size, so the viewer scrolls the whole document.
    const sizes = await sheets.evaluateAll((each) =>
      each.map((sheet) => Math.round(sheet.getBoundingClientRect().height)),
    );
    expect(new Set(sizes).size).toBeLessThanOrEqual(2);
    expect(Math.min(...sizes)).toBeGreaterThan(400);
    await sheets.last().scrollIntoViewIfNeeded();
    await expect(sheets.last()).toHaveAttribute('data-drawn', 'true');
    await expect(sheets.first()).not.toHaveAttribute('data-drawn');
    const drawn = await page.locator(`${SHEETS}[data-drawn]`).count();
    expect(drawn).toBeLessThanOrEqual(4);
  });

  // A late page's first caption, drawn alone and with every page before it drawn: the engine's number.
  for (const [name, index] of [
    ['caption-numbering', 4],
    ['long-mixed', 25],
  ] as const) {
    test(`DOCE-PAGINATION-13.7 numbers page ${String(index + 1)} of ${name} drawn alone as the engine laid it out`, async ({
      page,
    }) => {
      await open(page, name);
      const caption = page.locator(SHEETS).nth(index).locator('figcaption').first();
      const shoot = async () => {
        await page.locator(SHEETS).nth(index).scrollIntoViewIfNeeded();
        await expect(page.locator(SHEETS).nth(index)).toHaveAttribute('data-drawn', 'true');
        return caption.screenshot();
      };
      await showViewer(page, 0);
      const alone = await shoot();
      await expect(page.locator(`${SHEETS}[data-drawn]`)).not.toHaveCount(
        await page.locator(SHEETS).count(),
      );
      // The page carries the caption's number the engine laid the pages out with.
      const number = await caption.evaluate((element: HTMLElement) =>
        element.style.getPropertyValue('--de-number'),
      );
      expect(number).toMatch(/\d/u);
      await showViewer(page);
      expect((await shoot()).equals(alone)).toBe(true);
    });
  }
});
