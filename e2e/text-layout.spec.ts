import type { Page } from '@playwright/test';
import {
  REGRESSION_DOCUMENTS,
  type RegressionDocumentName,
} from '../labs/src/regression/regression-documents.js';
import type { RegressionProbe } from '../labs/src/regression/regression-probe.js';
import type { StressProbe } from '../labs/src/stress/stress-probe.js';
import { drawnNumbers } from './drawn-numbers.js';
import { expect, test, waitForLab } from './fixtures.js';

// The pages laid out and drawn with the text layout engine (specs/PAGINATION.md
// DOCE-PAGINATION-11): each regression document's forced blocks drawn on exactly the lines the
// engine computed.

declare global {
  interface Window {
    regressionLab: RegressionProbe;
    stressLab: StressProbe;
  }
}

const NAMES = Object.keys(REGRESSION_DOCUMENTS) as RegressionDocumentName[];

// With the layout debugging, whose page room the overflow check reads (DOCE-LABS-8.10), unless
// `plain`: its height labels take the place of generated numbers.
async function open(page: Page, name: RegressionDocumentName, plain = false) {
  await page.goto(`regression.html?document=${name}${plain ? '' : '&debug'}`);
  await waitForLab(page);
}

// What the pages drew: the forced blocks' computed lines, the guard's faults and the engine's
// lines. A header's, footer's or footnote area's block has no element id: it is named by its page,
// its region and its index in it.
const readLines = (page: Page) =>
  page.evaluate(() => {
    const key = (id: string, part: number) => `${id}#${String(part)}`;
    const regionKey = (page: number, region: string, index: number) =>
      `${String(page)}:${region}:${String(index)}`;
    const computed = new Map(
      window.regressionLab.textLines().flatMap((each, page) => {
        const inRegion = new Map<string, number>();
        return each.blocks.map((block) => {
          const lines = block.lines?.length ?? null;
          if (!block.region) return [key(block.elementId, block.part), lines] as const;
          const index = inRegion.get(block.region) ?? 0;
          inRegion.set(block.region, index + 1);
          return [regionKey(page, block.region, index), lines] as const;
        });
      }),
    );
    const pages = [...document.querySelectorAll('.de-document-editor__content .pm-page')];
    const regions = ['header', 'footer', 'footnotes'];
    const idOf = (block: HTMLElement) => {
      const region = regions.find((name) => block.closest(`.pm-page-${name}`));
      if (!region) return key(block.dataset.id ?? '', Number(block.dataset.splitPartIndex ?? 0));
      const page = pages.findIndex((each) => each.contains(block));
      const area = pages[page]?.querySelector(`.pm-page-${region}`);
      const blocks = area?.querySelectorAll(':is(p, h1, h2, h3, h4, h5, h6, pre)');
      const index = [...(blocks ?? [])].indexOf(block);
      return regionKey(page, region, index);
    };
    // Only the pages near the screen are drawn on forced lines (DOCE-PAGINATION-11.6).
    const forced = [...document.querySelectorAll<HTMLElement>('.de-forced-lines')].map((block) => {
      const id = idOf(block);
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
    test(`DOCE-LABS-6.1 DOCE-PAGINATION-11.2 DOCE-PAGINATION-11.4 draws ${name} on the engine's lines`, async ({
      page,
    }) => {
      await open(page, name);
      const laid = await readLines(page);
      expect(laid.wrapped).toEqual([]);
      expect(laid.mismatched).toEqual([]);
    });
  }

  test('DOCE-PAGINATION-11.1 DOCE-PAGINATION-11.2 keeps a typed paragraph on the engine lines', async ({
    page,
  }) => {
    await open(page, 'long-mixed');
    const before = await page.evaluate(() => {
      const block = window.regressionLab
        .textLines()[0]
        ?.blocks.find((each) => each.lines && !each.region);
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
    const after = await readLines(page);
    expect(after.wrapped).toEqual([]);
    expect(after.mismatched).toEqual([]);
    await expect(paragraph).toContainText('lines of this paragraph');
  });

  test('DOCE-PAGINATION-9.12 draws a paragraph that starts right to left from the right, on the engine lines', async ({
    page,
  }) => {
    await open(page, 'long-mixed');
    const id = await page.evaluate(
      () =>
        window.regressionLab
          .textLines()[0]
          ?.blocks.find((each) => (each.lines?.length ?? 0) > 2 && each.part === 0)?.elementId,
    );
    if (!id) throw new Error('no paragraph of three lines on the first page');
    const paragraph = page.locator(`.de-forced-lines[data-id="${id}"]`).first();
    await expect(paragraph).toHaveAttribute('dir', 'ltr');
    // Its first strong letter becomes Hebrew: the paragraph turns right to left.
    await paragraph.click({ position: { x: 1, y: 4 } });
    await page.keyboard.type('שלום עולם ');
    await page.evaluate(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return window.stressLab.whenSettled();
    });
    await expect(paragraph).toHaveAttribute('dir', 'rtl');
    const after = await readLines(page);
    expect(after.wrapped).toEqual([]);
    expect(after.mismatched).toEqual([]);
    // Every line starts at the right edge: the rightmost box of each drawn line meets it.
    const gaps = await paragraph.evaluate((element) => {
      const right = element.getBoundingClientRect().right;
      const range = document.createRange();
      range.selectNodeContents(element);
      const lines = new Map<number, number>();
      for (const rect of range.getClientRects()) {
        if (rect.width === 0) continue;
        const top = Math.round(rect.top + rect.height / 2);
        lines.set(top, Math.max(lines.get(top) ?? -Infinity, rect.right));
      }
      return [...lines.values()].map((edge) => Math.round(right - edge));
    });
    expect(gaps.length).toBeGreaterThan(2);
    expect(gaps.every((gap) => Math.abs(gap) <= 1)).toBe(true);
  });

  test('DOCE-PAGINATION-11.6 draws on forced lines only the pages near the screen', async ({
    page,
  }) => {
    await open(page, 'long-mixed');
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
    const after = await readLines(page);
    expect(after.wrapped).toEqual([]);
    expect(after.mismatched).toEqual([]);
  });

  test('DOCE-PAGINATION-11.6 draws a page on forced lines before it scrolls into view', async ({
    page,
  }) => {
    await open(page, 'long-mixed');
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
    await open(page, 'long-mixed');
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

  test('DOCE-HOST-1.14.2 draws the pages without a synthesised bold or italic', async ({
    page,
  }) => {
    await open(page, 'long-mixed');
    const synthesis = await page.evaluate(() => {
      const sheet = document.querySelector<HTMLElement>('.de-document-editor__content .pm-page');
      return sheet ? getComputedStyle(sheet).fontSynthesis : null;
    });
    expect(synthesis).toBe('none');
  });

  test('DOCE-PAGINATION-11.6 keeps every page on the engine lines through a snapshot when the host asked', async ({
    page,
  }) => {
    await open(page, 'long-mixed');
    const forced = () => page.evaluate(() => document.querySelectorAll('.de-forced-lines').length);
    const computed = await page.evaluate(
      () =>
        window.regressionLab
          .textLines()
          .flatMap((each) => each.blocks)
          .filter((block) => block.lines !== null).length,
    );
    await page.evaluate(() => window.regressionLab.drawAllLines(true));
    await expect.poll(forced).toBe(computed);
    await page.evaluate(() => window.regressionLab.snapshot());
    await page.evaluate(() => new Promise(requestAnimationFrame));
    expect(await forced()).toBe(computed);
    await page.evaluate(() => window.regressionLab.drawAllLines(false));
    await expect.poll(forced).toBeLessThan(computed);
  });

  test('DOCE-PAGINATION-11.9 draws every heading, caption and equation number the template gives', async ({
    page,
  }) => {
    await open(page, 'caption-numbering', true);
    const numbers = (chapter: string, at: string) => [
      `${chapter}.`,
      `Figure ${chapter}${at}1 -`,
      `Table ${chapter}${at}1 -`,
      `Code Block ${chapter}${at}1 -`,
      `(Eq. ${chapter}${at}1)`,
      ...(at === '.'
        ? [
            `${chapter}.1`,
            `Figure ${chapter}.2 -`,
            `Table ${chapter}.2 -`,
            `Code Block ${chapter}.2 -`,
            `(Eq. ${chapter}.2)`,
          ]
        : []),
    ];
    const drawn = (await drawnNumbers(page)).flat();
    expect(drawn).toEqual([
      'i.',
      'Figure i -',
      '(Eq. i)',
      ...numbers('1', '.'),
      ...numbers('2', '.'),
      ...numbers('3', '.'),
      ...numbers('A', '-'),
    ]);
  });

  test('DOCE-PAGINATION-11.3 gives no computed lines in the web layout', async ({ page }) => {
    await page.goto('regression.html?document=long-mixed&layout=web');
    await waitForLab(page);
    expect(await page.evaluate(() => window.regressionLab.textLines())).toEqual([]);
  });
});

test.describe('served fonts', () => {
  test('DOCE-HOST-1.14.1 DOCE-PAGINATION-12.5 shows the document without pages and says why when the host serves no shaper', async ({
    page,
  }) => {
    await page.goto('regression.html?document=long-mixed&fonts=none');
    await waitForLab(page);
    const root = page.locator('.de-document-editor').first();
    await expect(root).toHaveAttribute('data-text-layout-reason', 'no-shaper');
    await expect(root).toHaveAttribute('data-layout', 'web');
    await expect(page.getByText('The pages cannot be laid out')).toBeVisible();
    await expect(page.locator('.de-forced-lines')).toHaveCount(0);
  });

  test('DOCE-HOST-1.14.2 DOCE-PAGINATION-12.5 draws the pages from the served faces only, never synthesised', async ({
    page,
  }) => {
    await open(page, 'long-mixed');
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
    await open(page, 'long-mixed');
    const family = (selector: string) =>
      page
        .locator(`.de-document-editor__content .pm-page-content ${selector}`)
        .first()
        .evaluate((element) => getComputedStyle(element).fontFamily);
    expect(await family('p')).toBe('"Times New Roman"');
    expect(await family('pre')).toBe('"Courier New"');
  });

  const documents: readonly RegressionDocumentName[] = [
    'long-mixed',
    'code-blocks',
    'table-rich-cells',
    'footnotes-in-structures',
    'math',
  ];
  for (const name of documents) {
    test(`DOCE-PAGINATION-12.5 draws every text of ${name}'s pages in a family the host serves`, async ({
      page,
    }) => {
      await open(page, name);
      await page.evaluate(() => window.regressionLab.drawAllLines(true));
      // Each element that holds text and its first family, where that family has no served face.
      // Not yet MathML, which the browser draws in its own `math` family and the engine measures as
      // drawn (DOCE-PAGINATION-10.8); serving its font is the math atoms' open item (Q2).
      const unserved = await page.evaluate(() => {
        const served = new Set(
          [...document.fonts].map((face) => face.family.replace(/^"|"$/gu, '')),
        );
        const found = new Set<string>();
        const root = document.querySelector('.de-document-editor__content');
        const walker = document.createTreeWalker(root ?? document.body, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const element = node.parentElement;
          if (!element || !node.textContent?.trim() || element.closest('math')) continue;
          if (!element.closest('.pm-page')) continue;
          const first = getComputedStyle(element).fontFamily.split(',')[0]?.trim() ?? '';
          const family = first.replace(/^"|"$/gu, '');
          if (!served.has(family)) found.add(`${element.localName}: ${first}`);
        }
        return [...found].sort();
      });
      expect(unserved).toEqual([]);
    });
  }
});
