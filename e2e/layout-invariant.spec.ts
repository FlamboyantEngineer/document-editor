import type { Page, TestInfo } from '@playwright/test';
import {
  REGRESSION_DOCUMENTS,
  type RegressionDocumentName,
} from '../labs/src/regression/regression-documents.js';
import type { RegressionProbe } from '../labs/src/regression/regression-probe.js';
import type { StressProbe } from '../labs/src/stress/stress-probe.js';
import type { PageTextLines } from '../src/pagination/index.js';
import { type BlockAt, readDrawnLines, readDrawnPages } from './drawn-lines.js';
import { expect, test, waitForLab } from './fixtures.js';

// The one-result invariant (specs/LABS.md DOCE-LABS-8): with `textLayout: 'pretext'`, the lines and
// pages the layout engine computed are the ones the editor draws. For every document of the
// regression set, at zooms from 50 to 150 percent and at real device pixel ratios of 1, 1.25 and 2
// (the `chromium-dpr-*` projects), each page holds the text blocks the engine put on it, and each
// block draws exactly the engine's lines: same count, same text on each. The drawn lines are read
// from the characters' line boxes, so a line the browser wrapped by itself fails as surely as a
// forced break that drew nothing.

declare global {
  interface Window {
    regressionLab: RegressionProbe;
    stressLab: StressProbe;
  }
}

const NAMES = Object.keys(REGRESSION_DOCUMENTS) as RegressionDocumentName[];

// Every zoom at a device pixel ratio of 1; the ends and the middle at the others.
const ZOOMS = [50, 75, 100, 125, 150] as const;
const DPR_ZOOMS: readonly number[] = [50, 100, 150];

const FORCED = '.de-forced-lines';

const key = (block: { elementId: string; part: number }) =>
  `${block.elementId}#${String(block.part)}`;

// Spaces as the stored text holds them: a no-break space a browser kept at a writer's edge is a space.
const plain = (text: string) => text.replaceAll(' ', ' ');

async function open(page: Page, name: RegressionDocumentName, zoom: number) {
  await page.goto(`regression.html?document=${name}&textLayout=pretext&zoom=${String(zoom)}`);
  await waitForLab(page);
  // Every page on forced lines, not only those near the screen (DOCE-PAGINATION-11.6).
  await page.evaluate(() => window.regressionLab.drawAllLines(true));
  await settle(page);
}

const settle = (page: Page) =>
  page.evaluate(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    await document.fonts.ready;
    return window.stressLab.whenSettled();
  });

const computedOf = (page: Page): Promise<PageTextLines[]> =>
  page.evaluate(() => window.regressionLab.textLines());

/** One line drawn otherwise than the engine computed it. */
interface LineMismatch {
  readonly page: number;
  readonly block: string;
  readonly computed: readonly string[];
  readonly drawn: readonly string[] | null;
}

/** The invariant on the pages shown now: pages, the forced blocks on each, and every block's lines. */
async function expectOneResult(page: Page) {
  expect(
    await mismatchesOf(page),
    'blocks whose drawn lines differ from the computed ones',
  ).toEqual([]);
}

// Checks the pages and the forced blocks on each, and gives each block whose lines differ.
async function mismatchesOf(page: Page): Promise<LineMismatch[]> {
  const computed = await computedOf(page);
  const drawn = await readDrawnPages(page, FORCED);
  expect(drawn.pages, 'pages drawn against pages computed').toBe(computed.length);

  const forced = computed.map(({ blocks }) =>
    blocks.filter((block) => block.lines !== null).map(key),
  );
  expect(drawn.forced, 'forced blocks each page draws against those the engine put on it').toEqual(
    forced,
  );

  const asked: (BlockAt & { lines: readonly string[] })[] = computed.flatMap(({ blocks }, index) =>
    blocks.flatMap((block) =>
      block.lines
        ? [
            {
              page: index,
              elementId: block.elementId,
              part: block.part,
              lines: block.lines.map((line) => plain(line.text)),
            },
          ]
        : [],
    ),
  );
  const lines = await readDrawnLines(page, asked);
  return asked.flatMap((block, index) => {
    const own = lines[index]?.map(plain) ?? null;
    const same =
      own !== null &&
      own.length === block.lines.length &&
      own.every((text, at) => text === block.lines[at]);
    return same ? [] : [{ page: block.page, block: key(block), computed: block.lines, drawn: own }];
  });
}

// The zooms this project runs.
function zoomRuns(testInfo: TestInfo, zoom: number) {
  return testInfo.project.name === 'chromium' || DPR_ZOOMS.includes(zoom);
}

test.describe('DOCE-LABS-8.1 computed lines and pages are the drawn ones', () => {
  for (const name of NAMES) {
    for (const zoom of ZOOMS) {
      test(`DOCE-LABS-8.1 ${name} at ${String(zoom)}%`, async ({ page }, testInfo) => {
        test.skip(!zoomRuns(testInfo, zoom), 'the middle zooms run at a device pixel ratio of 1');
        await open(page, name, zoom);
        await expectOneResult(page);
      });
    }
  }

  test('DOCE-LABS-8.1 a line the browser wraps by itself fails the check', async ({ page }) => {
    await open(page, 'long-mixed', 100);
    expect(await mismatchesOf(page)).toEqual([]);
    // A column narrower than the one the engine fitted the lines to: the browser wraps them again.
    await page.addStyleTag({ content: 'p.de-forced-lines { inline-size: 60%; }' });
    const mismatches = await mismatchesOf(page);
    expect(mismatches.length).toBeGreaterThan(0);
    const [first] = mismatches;
    expect(first?.drawn?.length ?? 0).toBeGreaterThan(first?.computed.length ?? 0);
  });
});

test.describe('DOCE-LABS-8.2 the invariant holds through editing', () => {
  test('DOCE-LABS-8.2 typing and deleting at a paragraph split between pages', async ({ page }) => {
    await open(page, 'oversized-blocks', 100);
    const caret = await page.evaluate(() =>
      window.regressionLab.caretAtFragment('paragraph', 'head-end'),
    );
    expect(caret, 'a paragraph split between two pages').not.toBeNull();
    await page.keyboard.type(' and a few more words that move the line starts after them');
    await settle(page);
    await expectOneResult(page);
    for (let count = 0; count < 30; count += 1) await page.keyboard.press('Backspace');
    await settle(page);
    await expectOneResult(page);
  });

  test('DOCE-LABS-8.2 a hard break and a new paragraph at 125%', async ({ page }) => {
    await open(page, 'oversized-blocks', 125);
    const caret = await page.evaluate(() =>
      window.regressionLab.caretAtFragment('paragraph', 'continuation-start'),
    );
    expect(caret, 'a paragraph split between two pages').not.toBeNull();
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('After the break');
    await page.keyboard.press('Enter');
    await settle(page);
    await expectOneResult(page);
  });
});

// The tops of a forced paragraph's drawn lines and the place of each line's first character.
interface LineStart {
  readonly top: number;
  readonly x: number;
  readonly y: number;
}

/** The first forced paragraph with at least `least` lines, scrolled into view, and its line starts. */
function lineStartsOf(page: Page, least: number) {
  return page.evaluate((count) => {
    const block = [...document.querySelectorAll('.pm-page p.de-forced-lines')].find(
      (element) => Number(element.getAttribute('data-lines')) >= count,
    );
    if (!block) return null;
    block.scrollIntoView({ block: 'center' });
    const range = document.createRange();
    const starts: LineStart[] = [];
    let bottom = -Infinity;
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      for (let index = 0; index < (node.nodeValue ?? '').length; index += 1) {
        range.setStart(node, index);
        range.setEnd(node, index + 1);
        const rect = [...range.getClientRects()].find((each) => each.height > 0);
        if (!rect) continue;
        if ((rect.top + rect.bottom) / 2 > bottom)
          starts.push({ top: rect.top, x: rect.left + 1, y: (rect.top + rect.bottom) / 2 });
        bottom = Math.max(bottom, rect.bottom);
      }
    }
    return starts;
  }, least);
}

/** Where the caret is drawn: the top and left of the collapsed selection. */
const caretAt = (page: Page) =>
  page.evaluate(() => {
    const rect = getSelection()?.getRangeAt(0).getClientRects()[0];
    return { top: rect?.top ?? -1, left: rect?.left ?? -1 };
  });

// Lands in thread I's second pull request after #301: until then these fail, and Playwright
// reports them passing unexpectedly once they hold.
test.describe('DOCE-LABS-8.3 the caret at forced line starts', () => {
  test('DOCE-LABS-8.3 DOCE-PAGINATION-11.7 after an edit at a line start the caret is drawn on that line, and keeps its column', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'checked at a device pixel ratio of 1');
    await open(page, 'long-mixed', 100);
    const starts = await lineStartsOf(page, 3);
    const [first, second, third] = starts ?? [];
    if (!first || !second || !third) throw new Error('No paragraph with three lines.');
    await page.mouse.click(second.x, second.y);
    await page.keyboard.press('Home');
    await page.keyboard.type('x');
    await page.keyboard.press('Backspace');
    await settle(page);
    expect((await caretAt(page)).top, 'the caret on the line it starts').toBeCloseTo(
      second.top,
      -1,
    );
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    const column = (await caretAt(page)).left;
    await page.keyboard.press('ArrowDown');
    expect((await caretAt(page)).top, 'Arrow Down moves one line').toBeCloseTo(third.top, -1);
    await page.keyboard.press('ArrowUp');
    const back = await caretAt(page);
    expect(back.top).toBeCloseTo(second.top, -1);
    expect(Math.abs(back.left - column), 'Arrow Up and Down keep the column').toBeLessThan(2);
    // The exception: a caret the browser drew at a line's end, after End, stays there.
    await page.mouse.click(first.x, first.y);
    await page.keyboard.press('End');
    expect((await caretAt(page)).top, 'End keeps the caret on its line').toBeCloseTo(first.top, -1);
  });
});

test.describe('DOCE-LABS-8.4 inline offers keep the drawn lines', () => {
  test('DOCE-LABS-8.4 DOCE-PAGINATION-11.8 an inline completion offer inside a full line wraps nothing', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'checked at a device pixel ratio of 1');
    await page.goto('stress-long.html?textLayout=pretext');
    await waitForLab(page);
    await settle(page);
    const starts = await lineStartsOf(page, 3);
    const [first] = starts ?? [];
    if (!first) throw new Error('No paragraph with three lines.');
    // At the end of a full first line, so the offer drawn after the caret has no room on it.
    await page.mouse.click(first.x, first.y);
    await page.keyboard.press('End');
    await page.keyboard.type(' and');
    const offer = page.locator('.de-document-editor__content .de-inline-completion');
    await expect(offer).toHaveCount(1);
    const block = await offer.evaluate((element) => {
      const forced = element.closest('.de-forced-lines');
      return {
        page: [...document.querySelectorAll('.pm-page')].findIndex((each) =>
          each.contains(element),
        ),
        elementId: forced?.getAttribute('data-id') ?? '',
        part: Number(forced?.getAttribute('data-split-part-index') ?? 0),
        computed: Number(forced?.getAttribute('data-lines') ?? 0),
      };
    });
    const [drawn] = await readDrawnLines(page, [block]);
    expect(drawn?.length, 'lines drawn with the offer showing').toBe(block.computed);
  });
});
