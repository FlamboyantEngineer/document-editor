import type { BrowserContext, CDPSession, Page } from '@playwright/test';
import type { RegressionDocumentName } from '../labs/src/regression/regression-documents.js';
import type { RegressionProbe } from '../labs/src/regression/regression-probe.js';
import type { StressProbe } from '../labs/src/stress/stress-probe.js';
import type { PagesLayout } from '../src/document/index.js';
import {
  differences,
  drawStep,
  type EditTarget,
  lineMismatches,
  random,
  runStep,
} from './edit-sequences.js';
import { expect, test, waitForLab } from './fixtures.js';

// Edited pages match a fresh layout (specs/LABS.md DOCE-LABS-9): with `textLayout: 'pretext'`, after
// every step of a seeded sequence of edits (typing, IME composition, paste, undo and redo, splits
// and joins at line and page edges, deletes across pages, marks and styles that change the font,
// remote changes, zoom changes), what the editor draws equals what a new page draws when it opens the
// stored document afresh: the same pages' layout (pages, page breaks, split parts, every forced
// block's lines, numbers and variables), the same text on every page, and the editor's own drawn
// lines equal to its computed ones.

declare global {
  interface Window {
    regressionLab: RegressionProbe;
    stressLab: StressProbe;
  }
}

const settle = (page: Page) =>
  page.evaluate(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
    await document.fonts.ready;
    return window.stressLab.whenSettled();
  });

async function openLab(page: Page, name: RegressionDocumentName) {
  await page.goto(`regression.html?document=${name}&textLayout=pretext`);
  await waitForLab(page);
  await page.evaluate(() => window.regressionLab.drawAllLines(true));
  await settle(page);
}

// What a page draws, as the check compares it: its pages' layout, and the text of each page.
interface Drawn {
  readonly layout: PagesLayout | null;
  readonly pages: readonly string[];
}

const drawnOf = (page: Page): Promise<Drawn> =>
  page.evaluate(() => {
    const pages = [
      ...document.querySelectorAll(
        ':not(.de-document-viewer) > .de-document-editor__content .pm-page',
      ),
    ].map((each) => {
      const copy = each.cloneNode(true) as Element;
      for (const widget of copy.querySelectorAll('.ProseMirror-widget, .de-presence-caret'))
        widget.remove();
      return (copy.textContent ?? '').replaceAll(' ', ' ');
    });
    return { layout: window.regressionLab.layout(), pages };
  });

/** A fresh page that opens a stored document as a new page would. */
async function freshLayout(context: BrowserContext, name: RegressionDocumentName, page: Page) {
  const stored = await page.evaluate(() => window.regressionLab.stored());
  const fresh = await context.newPage();
  try {
    await openLab(fresh, name);
    await fresh.evaluate((file) => {
      if (file) window.regressionLab.load(file);
    }, stored);
    await fresh.waitForFunction(() => window.regressionLab.layout() !== null);
    await fresh.evaluate(() => window.regressionLab.drawAllLines(true));
    await settle(fresh);
    return await drawnOf(fresh);
  } finally {
    await fresh.close();
  }
}

// The regression lab's editor, as a sequence edits it.
const regressionTarget = (page: Page, cdp: CDPSession): EditTarget => ({
  page,
  cdp,
  ranges: () => page.evaluate(() => window.regressionLab.textRanges()),
  select: (from, to) =>
    page.evaluate(([a, b]) => window.regressionLab.selectJoined(a, b), [from, to] as const),
  caretAtFragment: async (type, edge) =>
    (await page.evaluate(([t, e]) => window.regressionLab.caretAtFragment(t, e), [
      type,
      edge,
    ] as const)) !== null,
  other: (change) => page.evaluate((each) => window.regressionLab.remote(each), change),
  zoom: (percent) => page.evaluate((each) => window.regressionLab.setZoom(each), percent),
});

const DOCUMENTS: readonly RegressionDocumentName[] = [
  'oversized-blocks',
  'long-mixed',
  'footnote-heavy',
  'footnotes-in-structures',
  'table-long-repeated-header',
  'table-rich-cells',
  'heading-keep-with-next',
  'list-split-stress',
  'caption-numbering',
  'mixed-geometry',
];

const SEEDS = Number(process.env.EDIT_LAYOUT_SEEDS ?? 2);
const LENGTH = Number(process.env.EDIT_LAYOUT_STEPS ?? 12);
const FIRST_SEED = Number(process.env.EDIT_LAYOUT_FIRST_SEED ?? 1);

test.describe('DOCE-LABS-9.1 edited pages equal a fresh layout of the stored document', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium only');
  for (const name of DOCUMENTS) {
    for (let seed = FIRST_SEED; seed < FIRST_SEED + SEEDS; seed += 1) {
      test(`DOCE-LABS-9.1 ${name}, seed ${String(seed)}`, async ({ page, context }) => {
        test.setTimeout(240_000);
        const next = random(seed * 7919 + name.length);
        const target = regressionTarget(page, await context.newCDPSession(page));
        await openLab(page, name);
        const done: string[] = [];
        for (let index = 0; index < LENGTH; index += 1) {
          const step = drawStep(next);
          done.push(step.label);
          await runStep(step, target, done);
          await page.evaluate(() => window.regressionLab.drawAllLines(true));
          await settle(page);
          const edited = await drawnOf(page);
          expect(edited.layout, 'pages laid out by the engine').not.toBeNull();
          const fresh = await freshLayout(context, name, page);
          const problems = [
            ...(await lineMismatches(
              page,
              await page.evaluate(() => window.regressionLab.textLines()),
            )),
            ...differences(edited.layout, fresh.layout, 'layout'),
            ...differences(edited.pages, fresh.pages, 'page text'),
          ];
          expect(
            problems,
            `after ${done.map((label, at) => `${String(at + 1)}. ${label}`).join('; ')}`,
          ).toEqual([]);
        }
      });
    }
  }
});
