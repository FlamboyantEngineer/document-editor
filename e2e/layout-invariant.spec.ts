import { createHash } from 'node:crypto';
import type { Page, TestInfo } from '@playwright/test';
import {
  REGRESSION_DOCUMENTS,
  type RegressionDocumentName,
} from '../labs/src/regression/regression-documents.js';
import type { RegressionProbe } from '../labs/src/regression/regression-probe.js';
import type { StressProbe } from '../labs/src/stress/stress-probe.js';
import type { PageTextLines } from '../src/pagination/index.js';
import {
  type LineMismatch,
  mismatchedLines,
  misplacedLineNumbers,
  readDrawnLines,
  readDrawnPages,
} from './drawn-lines.js';
import { expect, test, waitForLab } from './fixtures.js';
import { CANVAS_PROJECTS, DPR_ZOOMS, SCALING_ZOOMS } from './invariant-projects.js';
import { loadWrappedLinkedCode } from './wrapped-linked-code.js';

// The one-result invariant (specs/LABS.md DOCE-LABS-8): the lines and
// pages the layout engine computed are the ones the editor draws. For every document of the
// regression set, at zooms from 50 to 200 percent and at real device pixel ratios of 1, 1.25, 1.5,
// 1.75, 2 and 3 (the `chromium-dpr-*` projects), each page holds the text blocks the engine put on it, and each
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

// Every zoom a browser or the status bar offers at a device pixel ratio of 1 (the
// `chromium-invariant` project); the ends and the middle at ratios 1.25 and 2; 100 percent at the
// ratios of display scaling at 150, 175 and 300 percent (the `chromium-dpr-*` projects).
const ZOOMS = [50, 67, 75, 90, 100, 110, 125, 133, 150, 175, 200] as const;
// The pages painted into a canvas, at the status bar's zooms and the first two ratios.
const CANVAS_ZOOMS = [50, 75, 100, 125, 150] as const;

const FORCED = '.de-forced-lines';

const key = (block: { elementId: string; part: number }) =>
  `${block.elementId}#${String(block.part)}`;

async function open(
  page: Page,
  name: RegressionDocumentName,
  zoom: number,
  rendering: 'dom' | 'html-canvas' = 'dom',
  query = '',
) {
  await page.goto(
    `regression.html?document=${name}&zoom=${String(zoom)}&rendering=${rendering}${query}`,
  );
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

/** The invariant on the pages shown now: pages, the forced blocks on each, and every block's lines. */
async function expectOneResult(page: Page) {
  expect(
    await mismatchesOf(page),
    'blocks whose drawn lines differ from the computed ones',
  ).toEqual([]);
  // The guard (DOCE-PAGINATION-11.4) agrees: no false wrap, at any zoom.
  expect(
    await page.evaluate(() => window.regressionLab.wrappedLines()),
    'blocks the guard takes for wrapped',
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

  return mismatchedLines(page, computed);
}

// The zooms this project runs.
function zoomRuns(testInfo: TestInfo, zoom: number) {
  const { name } = testInfo.project;
  // The `chromium` project runs the other tests; `chromium-invariant` runs these at ratio 1.
  if (name === 'chromium') return false;
  if (name === 'chromium-invariant') return true;
  return (CANVAS_PROJECTS.includes(name) ? DPR_ZOOMS : SCALING_ZOOMS).includes(zoom);
}

test.describe('DOCE-LABS-8.1 computed lines and pages are the drawn ones', () => {
  for (const name of NAMES) {
    for (const zoom of ZOOMS) {
      test(`DOCE-LABS-8.1 ${name} at ${String(zoom)}%`, async ({ page }, testInfo) => {
        test.skip(!zoomRuns(testInfo, zoom), 'another project runs this zoom');
        await open(page, name, zoom);
        await expectOneResult(page);
        // Each line number sits on its line of code's first row (DOCE-PAGINATION-11.2).
        expect(await misplacedLineNumbers(page), 'code line numbers off their lines').toEqual([]);
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

  test('DOCE-LABS-8.1 linked code whose lines the engine wraps', async ({ page }) => {
    for (const zoom of [50, 100, 175]) {
      await open(page, 'linked-code', zoom);
      await loadWrappedLinkedCode(page);
      await page.evaluate(() => window.regressionLab.drawAllLines(true));
      await settle(page);
      const wraps = page.locator('.linked-code-block.de-forced-lines code .de-forced-lines__end');
      expect(await wraps.count(), 'lines the engine wrapped in linked code').toBeGreaterThan(4);
      await expectOneResult(page);
      expect(await misplacedLineNumbers(page), 'code line numbers off their lines').toEqual([]);
    }
  });
});

// The pages of the editor, and those of them painted into a canvas (DOCE-EDITOR-1.9).
const paintedPages = (page: Page) =>
  page.evaluate(() => {
    const content = document.querySelector('.de-document-editor__content');
    return {
      pages: content?.querySelectorAll('.pm-page').length ?? 0,
      painted: content?.querySelectorAll('.de-document-editor__canvas > .pm-page').length ?? 0,
    };
  });

test.describe('DOCE-LABS-8.9 the same lines and pages painted into a canvas', () => {
  for (const name of NAMES) {
    for (const zoom of CANVAS_ZOOMS) {
      test(`DOCE-LABS-8.9 ${name} at ${String(zoom)}% in a canvas`, async ({ page }, testInfo) => {
        test.skip(
          !CANVAS_PROJECTS.includes(testInfo.project.name) || !zoomRuns(testInfo, zoom),
          'the middle zooms run at a device pixel ratio of 1',
        );
        await open(page, name, zoom, 'html-canvas');
        const { pages, painted } = await paintedPages(page);
        expect(painted, 'pages painted into a canvas').toBe(pages);
        await expectOneResult(page);
      });
    }
  }
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
    await page.goto('stress-long.html');
    await waitForLab(page);
    await settle(page);
    // Lines are forced on the pages near the screen: bring the body text after the contents there.
    await page
      .locator('.de-document-editor__content .pm-page')
      .nth(2)
      .evaluate((element) => element.scrollIntoView());
    await expect
      .poll(() =>
        page
          .locator('.pm-page p.de-forced-lines')
          .evaluateAll((all) => all.some((each) => Number(each.getAttribute('data-lines')) >= 3)),
      )
      .toBe(true);
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

// The lines computed for every forced block, by element and part, as offsets: what a fresh layout
// of the same document gives.
async function computedLines(page: Page): Promise<Record<string, string>> {
  const pages = await computedOf(page);
  return Object.fromEntries(
    pages.flatMap(({ blocks }) =>
      blocks.flatMap((block) =>
        block.lines
          ? [
              [
                key(block),
                block.lines.map(({ from, to }) => `${String(from)}-${String(to)}`).join(' '),
              ],
            ]
          : [],
      ),
    ),
  );
}

test.describe('DOCE-LABS-8.5 formatting-only edits keep the drawn lines', () => {
  test('DOCE-LABS-8.5 bold, undo and redo draw the computed lines, and undo gives back the first layout', async ({
    page,
  }) => {
    await open(page, 'long-mixed', 100);
    const first = await computedLines(page);
    const starts = await lineStartsOf(page, 3);
    const [line] = starts ?? [];
    if (!line) throw new Error('No paragraph with three lines.');
    await page.mouse.dblclick(line.x + 4, line.y);
    await page.keyboard.press('ControlOrMeta+b');
    await settle(page);
    await expect(page.locator('.de-forced-lines strong').first()).toBeAttached();
    await expectOneResult(page);
    const bold = await computedLines(page);
    await page.keyboard.press('ControlOrMeta+z');
    await settle(page);
    await expectOneResult(page);
    expect(await computedLines(page), 'undo gives back the first layout').toEqual(first);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await settle(page);
    await expectOneResult(page);
    expect(await computedLines(page), 'redo gives back the bold layout').toEqual(bold);
  });
});

// Runs of text with no space to break at, so lines end and start inside them: repeated emoji, a
// joined family sequence, and letters with combining accents.
const CLUSTERS = ['😀'.repeat(90), '👩‍👩‍👧'.repeat(60), 'éä'.repeat(80)].join(' ');

/** Decoration spans of forced lines that cut a grapheme cluster, with their text. */
function cutClusters(page: Page) {
  return page.evaluate(() => {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    const cut: string[] = [];
    for (const span of document.querySelectorAll(
      '.de-forced-lines__end, .de-forced-lines__start',
    )) {
      const block = span.closest('.de-forced-lines');
      if (!block) continue;
      const before = document.createRange();
      before.setStart(block, 0);
      before.setEndBefore(span);
      const from = before.toString().length;
      const to = from + (span.textContent ?? '').length;
      const text = block.textContent ?? '';
      const ends = new Set([0]);
      for (const { index, segment } of segmenter.segment(text)) ends.add(index + segment.length);
      const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u;
      if (!ends.has(from) || !ends.has(to) || lone.test(span.textContent ?? ''))
        cut.push(JSON.stringify(span.textContent));
    }
    return cut;
  });
}

test.describe('DOCE-LABS-8.6 grapheme clusters at forced line edges', () => {
  test('DOCE-LABS-8.6 emoji, a joined sequence and combining marks at line ends and starts', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'checked at a device pixel ratio of 1');
    await open(page, 'long-mixed', 100);
    const starts = await lineStartsOf(page, 3);
    const [line] = starts ?? [];
    if (!line) throw new Error('No paragraph with three lines.');
    await page.mouse.click(line.x, line.y);
    await page.keyboard.press('End');
    await page.keyboard.insertText(` ${CLUSTERS} `);
    await settle(page);
    await expectOneResult(page);
    expect(await cutClusters(page), 'decorations that cut a grapheme cluster').toEqual([]);
    // From the start of each line the inserted runs reach, Shift+Arrow Right takes one whole cluster.
    const taken: string[] = [];
    for (let row = 0; row < 8; row += 1) {
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Home');
      await page.keyboard.press('Shift+ArrowRight');
      taken.push(await page.evaluate(() => getSelection()?.toString() ?? ''));
      await page.keyboard.press('ArrowLeft');
    }
    const clusters = taken.map(
      (text) =>
        [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].length,
    );
    expect(clusters, 'clusters Shift+Arrow Right takes at each line start').toEqual(
      taken.map(() => 1),
    );
  });
});

// Clusters longer than any fixed window: four people with skin tones (19 UTF-16 units) and a
// letter with 40 accents (41).
const TONED_FAMILY = '👨🏽‍👩🏾‍👧🏿‍👦🏻';
const ACCENTS = `q${'\u0301'.repeat(40)}`;

// Opens the regression lab on a document of the centered title and indented paragraphs given.
async function openWith(page: Page, title: string, paragraphs: string[]) {
  await open(page, 'long-mixed', 100);
  await page.evaluate(
    ({ title, paragraphs }) => {
      const file = window.regressionLab.stored();
      const section = file?.sections[0];
      if (!file || !section) throw new Error('The regression lab holds no document');
      const content = [
        {
          type: 'heading',
          attrs: { title: true, id: 'title' },
          content: [{ type: 'text', text: title }],
        },
        ...paragraphs.map((text, index) => ({
          type: 'paragraph',
          attrs: { id: `p${String(index)}` },
          content: [{ type: 'text', text }],
        })),
      ];
      window.regressionLab.load({ ...file, sections: [{ ...section, content }] });
    },
    { title, paragraphs },
  );
  await waitForLab(page);
  await page.evaluate(() => window.regressionLab.drawAllLines(true));
  await settle(page);
}

// The text of each forced line start drawn in a block.
const startsIn = (page: Page, selector: string) =>
  page.locator(`${selector} .de-forced-lines__start`).allTextContents();

test.describe('DOCE-LABS-8.6 grapheme clusters of any length', () => {
  test('DOCE-LABS-8.6 a centered title and indented lines start and end on whole long clusters', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'checked at a device pixel ratio of 1');
    const runs = [ACCENTS.repeat(90), TONED_FAMILY.repeat(40)].join(' ');
    await openWith(page, `${ACCENTS} centered ${runs}`, [`Lines ${runs}`]);
    await expectOneResult(page);
    expect(await cutClusters(page), 'decorations that cut a grapheme cluster').toEqual([]);
    // Each line of the centered title starts with its indent on one whole cluster, the first on the
    // letter with its 40 accents.
    const starts = await startsIn(page, '.de-document-editor__content h1');
    expect(starts.length, 'centered title lines').toBeGreaterThan(2);
    expect(starts[0]).toBe(ACCENTS);
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    expect(starts.map((text) => [...segmenter.segment(text)].length)).toEqual(starts.map(() => 1));
  });

  test('DOCE-PAGINATION-7.11 Backspace, Delete and the arrows take a long cluster whole', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'checked at a device pixel ratio of 1');
    await openWith(page, 'Title', ['Before']);
    const paragraph = page
      .locator('.de-document-editor__content .pm-page-content p')
      .filter({ hasText: 'Before' });
    await paragraph.click();
    await page.keyboard.press('End');
    await page.keyboard.insertText(` A${TONED_FAMILY}Z`);
    await settle(page);
    // The caret after the family: Backspace once deletes it whole.
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Backspace');
    await settle(page);
    await expect(paragraph).toHaveText('Before AZ');
    // The caret before it, after an arrow steps back over it whole: Delete once deletes it whole.
    await page.keyboard.insertText(`${TONED_FAMILY}${ACCENTS}`);
    await settle(page);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Delete');
    await settle(page);
    await expect(paragraph).toHaveText(`Before A${ACCENTS}Z`);
    await page.keyboard.press('Delete');
    await settle(page);
    await expect(paragraph).toHaveText('Before AZ');
  });
});

// The forced blocks on the pages in view, each drawing the lines it carries in `data-lines`.
async function wrappedInView(page: Page) {
  const blocks = await page.evaluate(() => {
    const pages = [...document.querySelectorAll('.de-document-editor__content .pm-page')];
    return pages.flatMap((each, index) => {
      const box = each.getBoundingClientRect();
      if (box.bottom < 0 || box.top > innerHeight) return [];
      return [...each.querySelectorAll('.de-forced-lines')].map((block) => ({
        page: index,
        elementId: block.getAttribute('data-id') ?? '',
        part: Number(block.getAttribute('data-split-part-index') ?? 0),
        computed: Number(block.getAttribute('data-lines') ?? 0),
      }));
    });
  });
  const drawn = await readDrawnLines(page, blocks);
  expect(blocks.length, 'forced blocks in view').toBeGreaterThan(0);
  return blocks.flatMap((block, index) =>
    drawn[index]?.length === block.computed
      ? []
      : [{ block: key(block), computed: block.computed, drawn: drawn[index]?.length ?? null }],
  );
}

test.describe('DOCE-LABS-8.7 review and editing on a stress document', () => {
  test('DOCE-LABS-8.7 comments, tracked changes, a context menu and keyboard editing keep the lines', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'checked at a device pixel ratio of 1');
    test.setTimeout(120_000);
    await page.goto('stress-scale.html?size=7&suggest');
    // 300 pages and 500 threads take longer to open than a lab's usual wait.
    await expect(page.locator('html')).toHaveAttribute('data-lab-ready', 'true', {
      timeout: 90_000,
    });
    await settle(page);
    expect(await wrappedInView(page), 'blocks wrapped by the browser on opening').toEqual([]);
    const starts = await lineStartsOf(page, 3);
    const [first, second] = starts ?? [];
    if (!first || !second) throw new Error('No paragraph with three lines.');

    // A comment on a word of a forced line.
    await page.mouse.dblclick(second.x + 4, second.y);
    await page
      .getByRole('list', { name: 'Comments' })
      .getByRole('button', { name: 'Comment' })
      .click();
    await page.keyboard.type('A note on this word.');
    await page
      .getByRole('list', { name: 'Comments' })
      .getByRole('button', { name: 'Comment' })
      .click();
    await settle(page);
    expect(await wrappedInView(page), 'after a comment').toEqual([]);

    // Suggested words typed into the line, and a suggested deletion.
    await page.mouse.click(first.x, first.y);
    await page.keyboard.press('End');
    await page.keyboard.type(' suggested words go into this line ');
    await expect(page.locator('.de-document-editor__content ins').first()).toBeAttached();
    for (let count = 0; count < 12; count += 1) await page.keyboard.press('Backspace');
    await settle(page);
    expect(await wrappedInView(page), 'after tracked changes').toEqual([]);

    // The context menu over a forced line, opened and closed.
    await page.mouse.click(second.x + 30, second.y, { button: 'right' });
    await expect(page.getByRole('menu').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);

    // Keyboard editing: a new paragraph, words, a hard break, deleting and undoing.
    await page.mouse.click(second.x, second.y);
    await page.keyboard.press('Home');
    await page.keyboard.press('Enter');
    await page.keyboard.type('A new paragraph of words that runs long enough to wrap onto lines ');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('after a break');
    await page.keyboard.press('ControlOrMeta+Backspace');
    await page.keyboard.press('ControlOrMeta+z');
    await settle(page);
    expect(await wrappedInView(page), 'after keyboard editing').toEqual([]);
  });
});

// The documents whose computed result is pinned, and its fingerprints: the same on every device and
// at every zoom, as recorded at a device pixel ratio of 1 and 100 percent. `lines` covers the pages
// and their text blocks' lines, `heights` each page's used and free room and each block's planned
// top and height.
// Recorded with Chromium's Canvas on Linux; the CI runner's fingerprints are the reference.
// The paragraphs in tables' cells, lists' items and quotes, and the text blocks of headers, footers and
// footnote areas, are on forced lines and counted too (DOCE-PAGINATION-11.2); the top-level
// blocks' line fingerprints did not move.
// Code figures and their captions are planned by the engine, each part of a split code figure with
// its caption (DOCE-PAGINATION-9.11), and margins are truncated to the layout unit as Chromium draws
// them (8pt is 10.656px, not 10.672px; DOCE-PAGINATION-9.2): the planned heights moved, and the
// oversized quote holding a code figure is on forced lines.
// Captions of figures, tables and code are drawn on forced lines and counted too
// (DOCE-PAGINATION-11.2): the line fingerprints of the documents with captions moved, their planned
// heights did not.
// Display equations are sized by MathJax (DOCE-PAGINATION-12.12): caption-numbering's planned
// heights moved.
// A later part's caption and a label its lines break inside are drawn on forced lines, and a
// caption switched off is no forced block (DOCE-PAGINATION-11.2): the line fingerprints of the
// documents with them moved, their planned heights did not.
// Every figure and image holds its stored size (DOCE-SCHEMA-3.14): the fixtures' figures take their
// 1 by 1 images' size, not a broken image's box, so the documents with figures moved.
const PINNED: Readonly<
  Partial<Record<RegressionDocumentName, { readonly lines: string; readonly heights: string }>>
> = {
  'caption-numbering': { lines: '413c009799e0d107', heights: 'b94dd743123e4fd3' },
  'heading-keep-with-next': { lines: 'f3b2f4d0f58c7941', heights: '7adf329654b1bc43' },
  // Footnote entries lost the browser's paragraph margins (DOCE-PAGINATION-11.10), and the Serif
  // paragraphs are measured and drawn in the served Tinos (DOCE-PAGINATION-12.5). Footnote areas are
  // the engine's height, no longer rounded up to the browser's layout unit (DOCE-PAGINATION-10.10),
  // so the pages with footnotes have 0.005 px more room.
  // Code continuation offsets include the newline the page split dropped (DOCE-PAGINATION-11.3).
  'long-mixed': { lines: 'f444ccf37cb49072', heights: 'b4cfd9dd8d7e41fe' },
  'oversized-blocks': { lines: '50c6db2fb84ad93e', heights: 'f3be75ce06ce1c8d' },
  'roman-numbering-stress': { lines: '94afcf7cec6e0914', heights: 'd40800e840119375' },
};

const digest = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 16);

/**
 * A fingerprint of the computed result: pages, each block's type and part, and its line offsets, or
 * why the engine left it to the browser.
 */
async function fingerprintOf(page: Page): Promise<string> {
  const pages = await computedOf(page);
  const text = pages
    .map(({ blocks }) =>
      blocks
        .map(
          (block) =>
            `${block.type}#${String(block.part)}:${
              block.lines?.map(({ from, to }) => `${String(from)}-${String(to)}`).join(',') ??
              block.reason ??
              ''
            }`,
        )
        .join('|'),
    )
    .join('\n');
  return digest(text);
}

/**
 * The planned heights, from the lab's `debug` query, and their fingerprint: each page's used and
 * free room, and each top-level block's type, part, planned top and height, to a thousandth of a
 * pixel.
 */
async function plannedHeightsOf(page: Page): Promise<{ text: string; print: string }> {
  const text = await page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        ':not(.de-document-viewer) > .de-document-editor__content .pm-page',
      ),
    ]
      .map((sheet) => {
        const blocks = [
          ...sheet.querySelectorAll<HTMLElement>(':scope > .pm-page-content > [data-debug-height]'),
        ].map(
          ({ dataset }) =>
            `${dataset.debugType ?? ''}#${dataset.splitPartIndex ?? '0'}:${dataset.debugTop ?? ''}+${dataset.debugHeight ?? ''}`,
        );
        return `${sheet.dataset.debugUsed ?? ''}/${sheet.dataset.debugFree ?? ''}|${blocks.join('|')}`;
      })
      .join('\n'),
  );
  return { text, print: digest(text) };
}

test.describe('DOCE-LABS-8.8 the computed result is the same on every device', () => {
  const pins = Object.entries(PINNED) as [
    RegressionDocumentName,
    { readonly lines: string; readonly heights: string },
  ][];
  for (const [name, pinned] of pins) {
    for (const zoom of [50, 100, 150]) {
      test(`DOCE-LABS-8.8 ${name} at ${String(zoom)}%`, async ({ page }, testInfo) => {
        await open(page, name, zoom);
        const print = await fingerprintOf(page);
        testInfo.annotations.push({
          type: 'fingerprint',
          description: `${testInfo.project.name} ${print}`,
        });
        expect(print, 'the computed result, as recorded').toBe(pinned.lines);
      });

      test(`DOCE-LABS-8.8 ${name}'s planned heights at ${String(zoom)}%`, async ({
        page,
      }, testInfo) => {
        await open(page, name, zoom, 'dom', '&debug');
        const { text, print } = await plannedHeightsOf(page);
        testInfo.annotations.push({
          type: 'fingerprint',
          description: `${testInfo.project.name} heights ${print}`,
        });
        // On a failure the message gives each page's room and each block's planned top and height, so
        // a run on another system names the block that differs.
        expect(print, `the planned heights, as recorded, from:\n${text}`).toBe(pinned.heights);
      });
    }
  }
});
