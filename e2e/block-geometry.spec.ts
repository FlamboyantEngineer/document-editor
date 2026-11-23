import type { Page } from '@playwright/test';
import {
  REGRESSION_DOCUMENTS,
  type RegressionDocumentName,
} from '../labs/src/regression/regression-documents.js';
import type { RegressionProbe } from '../labs/src/regression/regression-probe.js';
import type { StressProbe } from '../labs/src/stress/stress-probe.js';
import { type GeometryMismatch, readBlockGeometry } from './block-geometry.js';
import { expect, test, waitForLab } from './fixtures.js';

// Planned block geometry is the drawn one (specs/LABS.md DOCE-LABS-8.10): for every document of the
// regression set, laid out with the DOM's measuring and with the layout engine, each top-level
// block of each page is drawn as tall as the layout planned it, as far below the block before it,
// and no page's content reaches past its room. Every place that differs today is listed below with
// the thread that owns its fix: a new difference fails, and so does a listed one that no longer
// happens, so a fix removes its entry in the same pull request.

declare global {
  interface Window {
    regressionLab: RegressionProbe;
    stressLab: StressProbe;
  }
}

const NAMES = Object.keys(REGRESSION_DOCUMENTS) as RegressionDocumentName[];
// Under the text layout engine only: it becomes the only mode.
const MODES = ['pretext'] as const;
type Mode = (typeof MODES)[number];

/**
 * Known differences by place, each one block's fragment and kind (`figure 3#0 height`, numbered
 * as `GeometryMismatch.block`) or a page's overflow (`page 4 overflow`, from 0), with the thread
 * that owns its fix. A second block or fragment with the same fault is a new difference.
 */
type Known = Readonly<Record<string, string>>;

const placeOf = (found: GeometryMismatch) =>
  found.kind === 'overflow'
    ? `page ${String(found.page)} overflow`
    : `${found.block} ${found.kind}`;

// What differs today, by document and text layout. The check fails when a listed place no longer
// differs, so a fix removes its entry.
const KNOWN: Readonly<Partial<Record<`${RegressionDocumentName} ${Mode}`, Known>>> = {};

// Differences that depend on timing, which the check allows but does not ask for. The fixtures'
// figures hold an image that never loads (a cut GIF): the plan gives each no height, or the
// height of its drawn alt box, or of two, by whether the image's error came before the layout; an
// equation's plan likewise by whether it was drawn first. That the plan depends on timing is the
// fault, and its owner's. A figure's allowance holds only for a figure whose image did not load.
const NO_IMAGE =
  'Q2 atoms: a figure whose image never loads planned by whether its error came before the layout';
const TIMING = 'Q2 atoms (P1): display math planned by whether KaTeX drew it before the layout';
const CUT_IMAGES: readonly RegressionDocumentName[] = [
  'caption-numbering',
  'columns',
  'contents-lists',
  'cross-references',
  'figures',
  'inline-images',
  'long-mixed',
  'roman-numbering-coverage',
];
// The equations of the caption-numbering document, each its own place.
const CAPTION_EQUATIONS = Object.fromEntries(
  Array.from({ length: 8 }, (_, at) => [`math_display ${String(at + 1)}#0 height`, TIMING]),
);
const SOMETIMES: Readonly<Partial<Record<`${RegressionDocumentName} ${Mode}`, Known>>> = {
  'caption-numbering pretext': CAPTION_EQUATIONS,
};

// The fault a difference that depends on timing is allowed as: a figure whose image never loaded,
// in a document with cut images, or a listed place; none for any other difference.
function timingFault(name: RegressionDocumentName, mode: Mode, found: GeometryMismatch) {
  const figure = found.block.startsWith('figure ') && found.brokenImage === true;
  if (figure && CUT_IMAGES.includes(name) && found.kind === 'height') return NO_IMAGE;
  return SOMETIMES[`${name} ${mode}`]?.[placeOf(found)];
}

async function open(page: Page, name: RegressionDocumentName, textLayout: Mode) {
  await page.goto(`regression.html?document=${name}&textLayout=${textLayout}&debug`);
  await waitForLab(page);
  // Every page on forced lines, not only those near the screen (DOCE-PAGINATION-11.6).
  await page.evaluate(async () => {
    window.regressionLab.drawAllLines(true);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await document.fonts.ready;
    return window.stressLab.whenSettled();
  });
}

const kindOf = (found: GeometryMismatch) =>
  found.kind === 'overflow' ? 'page overflow' : `${found.block.split(' ')[0] ?? ''} ${found.kind}`;

test.describe('DOCE-LABS-8.10 planned block geometry is the drawn one', () => {
  for (const name of NAMES) {
    for (const mode of MODES) {
      test(`DOCE-LABS-8.10 ${name} with ${mode} text layout`, async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'chromium', 'checked at a device pixel ratio of 1');
        await open(page, name, mode);
        const found = await readBlockGeometry(page);
        const known = KNOWN[`${name} ${mode}`] ?? {};
        const unknown = found.filter(
          (each) => !(placeOf(each) in known || timingFault(name, mode, each)),
        );
        expect(unknown, 'blocks drawn otherwise than planned, not known').toEqual([]);
        const places = new Set(found.map(placeOf));
        const gone = Object.entries(known).filter(([place]) => !places.has(place));
        expect(gone, 'known differences that no longer happen: remove them').toEqual([]);
      });
    }
  }

  test('DOCE-PAGINATION-3.6 draws each part of a paragraph split after its hard breaks as planned', async ({
    page,
  }) => {
    await open(page, 'long-mixed', 'pretext');
    // Lines of text, each followed by two hard breaks, so splits fall both after a line's text
    // and after the empty line between the breaks.
    await page.evaluate(() => {
      const file = window.regressionLab.stored();
      const section = file?.sections[0];
      if (!file || !section) throw new Error('The regression lab holds no document');
      const content = Array.from({ length: 80 }, (_, line) => [
        { type: 'text', text: `   Line ${String(line + 1)}` },
        { type: 'lineBreak' },
        { type: 'lineBreak' },
      ]).flat();
      window.regressionLab.load({
        ...file,
        sections: [
          { ...section, content: [{ type: 'paragraph', attrs: { id: 'breaks' }, content }] },
        ],
      });
    });
    await waitForLab(page);
    await page.evaluate(async () => {
      window.regressionLab.drawAllLines(true);
      await new Promise((resolve) => setTimeout(resolve, 100));
      return window.stressLab.whenSettled();
    });
    const parts = page.locator('.pm-page-content > p[data-debug-height]');
    expect(await parts.count()).toBeGreaterThan(3);
    expect(await readBlockGeometry(page)).toEqual([]);
  });

  test('DOCE-LABS-8.10 a block drawn taller or lower than planned fails the check', async ({
    page,
  }) => {
    await open(page, 'long-mixed', 'pretext');
    expect(await readBlockGeometry(page)).not.toContainEqual(
      expect.objectContaining({ kind: 'overflow' }),
    );
    // A padding the plan does not know of on every paragraph, and every heading drawn lower.
    await page.addStyleTag({
      content: `.pm-page-content > p { padding-block-end: 12px; }
        .pm-page-content > :is(h1, h2, h3) { translate: 0 4px; }`,
    });
    const found = await readBlockGeometry(page);
    const kinds = new Set(found.map(kindOf));
    expect(kinds).toContain('paragraph height');
    expect(kinds).toContain('heading gap');
    expect(kinds).toContain('page overflow');
  });
});
