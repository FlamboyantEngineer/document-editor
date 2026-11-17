import type { Locator, Page } from '@playwright/test';
import type { RegressionDocumentName } from '../labs/src/regression/regression-documents.js';
import type { StressProbe } from '../labs/src/stress/stress-probe.js';
import { expect, test, waitForLab } from './fixtures.js';

// Change bars on the regression set's documents (specs/VERSIONS.md DOCE-VERSIONS-3): the
// regression lab with `compare` shows the changes since the document opened as change bars, so a
// document shows none until it is edited, and an edit marks only the lines it changed, in the
// colors of the section it is in.

declare global {
  interface Window {
    stressLab: StressProbe;
  }
}

const content = (page: Page) => page.locator('.de-document-editor__content');
const lineBars = (page: Page) => content(page).locator('.de-change-lines__line');

async function openCompared(page: Page, name: RegressionDocumentName) {
  await page.goto(`regression.html?document=${name}&compare`);
  await waitForLab(page);
}

const settle = (page: Page) =>
  page.evaluate(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return window.stressLab.whenSettled();
  });

// Types at the end of a block's text.
async function typeAtEnd(page: Page, block: Locator, typed: string) {
  await block.scrollIntoViewIfNeeded();
  await block.click();
  await page.keyboard.press('End');
  await page.keyboard.type(typed);
  await settle(page);
}

// A block found by its text, kept by its element id once its text changes.
async function byId(page: Page, block: Locator): Promise<Locator> {
  const id = await block.first().getAttribute('data-id');
  return content(page).locator(`[data-id="${String(id)}"]`);
}

const colorsOf = (bars: Locator) =>
  bars.evaluateAll((elements) =>
    elements.map((element) => [
      element.getAttribute('data-diff-line'),
      getComputedStyle(element).backgroundColor,
    ]),
  );

// Documents of each kind of structure the bars are drawn beside.
const DOCUMENTS: readonly RegressionDocumentName[] = [
  'long-mixed',
  'list-split-stress',
  'table-long-repeated-header',
  'table-merged-cells',
  'footnote-heavy',
  'figures',
  'math',
  'code-block-stress',
  'mixed-geometry-repeated-sections',
  'comments-and-suggestions',
];

test.describe('change bars on the regression set', () => {
  for (const name of DOCUMENTS) {
    test(`DOCE-VERSIONS-3.2 shows no change bars on ${name} until it is edited`, async ({
      lab,
      page,
    }) => {
      await openCompared(page, name);
      await expect(page.locator('.de-document-editor')).toHaveAttribute('data-comparing', 'bars');
      await expect(lineBars(page)).toHaveCount(0);
      await expect(content(page).locator('[data-diff-change], [data-diff-deletion]')).toHaveCount(
        0,
      );
      expect(lab.errors).toEqual([]);
    });
  }

  test('DOCE-VERSIONS-3.4 marks only the list items edited, on the pages they are on', async ({
    page,
  }) => {
    await openCompared(page, 'list-split-stress');
    const item = (text: RegExp) => content(page).locator('li > p', { hasText: text });
    // A one-line item near the start, and a two-line item pages later.
    const first = await byId(page, item(/^Single item 2$/));
    const later = await byId(page, item(/^Numbered runway 40\./));
    await typeAtEnd(page, first, ' edited');
    await typeAtEnd(page, later, '!');
    // Words added to a line are an insertion; the later item's first line is unchanged.
    expect(await colorsOf(lineBars(page))).toEqual([
      ['insertion', 'rgb(0, 221, 0)'],
      ['insertion', 'rgb(0, 221, 0)'],
    ]);
    await expect(first.locator('.de-change-lines__line')).toHaveCount(1);
    await expect(later.locator('.de-change-lines__line')).toHaveCount(1);
    const pageOf = (block: Locator) =>
      block.evaluate((element) =>
        [...document.querySelectorAll('.pm-page')].findIndex((each) => each.contains(element)),
      );
    expect(await pageOf(later)).toBeGreaterThan(await pageOf(first));
  });

  test('DOCE-VERSIONS-3.2 draws a section with change bar settings of its own in its colors', async ({
    page,
  }) => {
    // The appendix sets teal insertions and no modification bars; the body keeps the template's.
    await openCompared(page, 'mixed-geometry-repeated-sections');
    const paragraph = (text: string) =>
      content(page).locator('.pm-page-content > p', { hasText: text });
    const barsOf = (text: string) => colorsOf(paragraph(text).locator('.de-change-lines__line'));
    await typeAtEnd(page, paragraph('A brass barometer'), ' Added.');
    await typeAtEnd(page, paragraph('Readings older than a year'), ' Added.');
    await page.keyboard.press('Enter');
    await page.keyboard.type('A new appendix line.');
    // Words replaced are a modification: in the body's heading, and in the second appendix.
    const replaceEnd = async (block: Locator) => {
      await typeAtEnd(page, block, '');
      for (let index = 0; index < 3; index += 1) await page.keyboard.press('Shift+ArrowLeft');
      await page.keyboard.type('xyz');
      await settle(page);
    };
    const heading = await byId(
      page,
      content(page).locator('.pm-page-content > h1', { hasText: /^Body$/ }),
    );
    await replaceEnd(heading);
    await replaceEnd(paragraph('The reading room opens'));
    expect(await colorsOf(heading.locator('.de-change-lines__line'))).toEqual([
      ['modification', 'rgb(0, 0, 221)'],
    ]);
    expect(await barsOf('A brass barometer')).toEqual([['insertion', 'rgb(0, 221, 0)']]);
    expect(await barsOf('Readings older than a year')).toEqual([['insertion', 'rgb(0, 128, 128)']]);
    // The appendix's modification bars are turned off: they draw nothing.
    expect(await barsOf('The reading room opens')).toEqual([]);
    const inserted = paragraph('A new appendix line.');
    await expect(inserted).toHaveAttribute('data-diff-change', 'insertion');
    expect(
      await inserted.evaluate((element) => getComputedStyle(element, '::after').backgroundColor),
    ).toBe('rgb(0, 128, 128)');
  });
});
