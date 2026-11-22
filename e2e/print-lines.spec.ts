import type { Page } from '@playwright/test';
import type { RegressionDocumentName } from '../labs/src/regression/regression-documents.js';
import type { RegressionProbe } from '../labs/src/regression/regression-probe.js';
import { printSnapshot } from '../src/document/index.js';
import { expect, test, waitForLab } from './fixtures.js';
import { expectPrintEqualsEditor, pdfPageTexts } from './print-fidelity.js';

// Print on the layout engine's lines (specs/PAGINATION.md DOCE-PAGINATION-13): the editor's
// snapshot and the static render of its pages' layout, each printed to PDF, hold every page's
// computed lines on that page, and the static render prints as the editor shows its pages.

declare global {
  interface Window {
    regressionLab: RegressionProbe;
  }
}

const ROOMY = { width: 1600, height: 1800 };

// Documents with split paragraphs, numbered headings, tables, captions, lists, rules, page breaks,
// footnotes and sections of other sizes, and none of what only a view draws (lists of contents,
// highlighted code, typeset math).
const NAMES: readonly RegressionDocumentName[] = [
  'heading-keep-with-next',
  'mixed-geometry-repeated-sections',
  'page-breaks-and-rules',
  'footnote-heavy',
  'blockquotes',
  'long-ordered-list',
];

async function open(page: Page, name: RegressionDocumentName) {
  await page.setViewportSize(ROOMY);
  await page.goto(`regression.html?document=${name}&textLayout=pretext`);
  await waitForLab(page);
}

type Print = 'snapshot' | 'layoutPrint';

// The print the lab makes, styled by the reference stylesheet.
const printOf = (page: Page, kind: Print) =>
  page.evaluate(([how, href]) => window.regressionLab[how]({ stylesheets: [href] }) ?? '', [
    kind,
    new URL('build/reference.css', page.url()).href,
  ] as const);

const squash = (text: string) => text.replace(/\s+/gu, ' ').trim();

// Each page's computed lines missing from that page of the PDF, in order.
async function missingLines(page: Page, kind: Print) {
  const pages = await page.evaluate(() =>
    window.regressionLab
      .textLines()
      .map((each) => each.blocks.flatMap((block) => block.lines?.map((line) => line.text) ?? [])),
  );
  const printed = await page.context().newPage();
  const result = await printSnapshot(printed, await printOf(page, kind));
  await printed.close();
  if (!result.ok) throw new Error(`The print did not finish: ${result.reason}`);
  const texts = pdfPageTexts(Buffer.from(result.pdf), pages.length).map(squash);
  return pages.flatMap((lines, index) => {
    let from = 0;
    return lines.flatMap((line) => {
      const at = (texts[index] ?? '').indexOf(squash(line), from);
      if (at < 0) return [{ page: index + 1, line }];
      from = at + squash(line).length;
      return [];
    });
  });
}

test.describe('print on the layout engine lines', () => {
  for (const name of NAMES) {
    test(`DOCE-PAGINATION-13.5 prints the snapshot of ${name} on the computed lines`, async ({
      page,
    }) => {
      await open(page, name);
      expect(await missingLines(page, 'snapshot')).toEqual([]);
    });

    test(`DOCE-PAGINATION-13.4 prints the layout of ${name} on the computed lines, as the editor shows it`, async ({
      page,
      context,
    }) => {
      await open(page, name);
      expect(await missingLines(page, 'layoutPrint')).toEqual([]);
      await expectPrintEqualsEditor(page, context, () => printOf(page, 'layoutPrint'));
    });
  }

  test('DOCE-PAGINATION-13.5 keeps the numbers headings were laid out with in print', async ({
    page,
  }) => {
    await open(page, 'heading-keep-with-next');
    const numbers = await page.evaluate(() => {
      const read = (html: string) =>
        [...new DOMParser().parseFromString(html, 'text/html').querySelectorAll('h2[data-number]')]
          .map((heading) => heading.getAttribute('data-number'))
          .slice(0, 3);
      const shown = [...document.querySelectorAll('.pm-page-content > h2.de-forced-lines')]
        .map((heading) => heading.getAttribute('data-number'))
        .slice(0, 3);
      const options = {};
      return {
        shown,
        snapshot: read(window.regressionLab.snapshot(options) ?? ''),
        layout: read(window.regressionLab.layoutPrint(options) ?? ''),
      };
    });
    expect(numbers.shown[0]).toMatch(/ $/u);
    expect(numbers.snapshot).toEqual(numbers.shown);
    expect(numbers.layout).toEqual(numbers.shown);
  });
});
