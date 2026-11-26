import type { Page } from '@playwright/test';
import type { RegressionDocumentName } from '../labs/src/regression/regression-documents.js';
import type { RegressionProbe } from '../labs/src/regression/regression-probe.js';
import { printSnapshot } from '../src/document/index.js';
import { mismatchedLines } from './drawn-lines.js';
import { expect, test, waitForLab } from './fixtures.js';
import { expectPrintEqualsEditor, pdfFontNames, pdfPageTexts } from './print-fidelity.js';
import { loadWrappedLinkedCode } from './wrapped-linked-code.js';

// Print on the layout engine's lines (specs/PAGINATION.md DOCE-PAGINATION-13): the editor's
// snapshot and the static render of its pages' layout, each printed to PDF, hold every page's
// computed lines on that page, the print draws each forced block on exactly those lines, with no
// line the browser wrapped by itself, the PDF embeds only the served faces the lines were broken in
// (DOCE-PAGINATION-13.8), and the static render prints as the editor shows its pages.

declare global {
  interface Window {
    regressionLab: RegressionProbe;
  }
}

const ROOMY = { width: 1600, height: 1800 };

// Documents with split paragraphs, numbered headings, tables, captions, lists, rules, page breaks,
// footnotes, code and linked code with their gutters, and sections of other sizes, and none of what
// only a view draws (lists of contents, typeset math).
const NAMES: readonly RegressionDocumentName[] = [
  'heading-keep-with-next',
  'mixed-geometry-repeated-sections',
  'page-breaks-and-rules',
  'footnote-heavy',
  'blockquotes',
  'long-ordered-list',
  'code-blocks',
  'linked-code',
];

async function open(page: Page, name: RegressionDocumentName) {
  await page.setViewportSize(ROOMY);
  await page.goto(`regression.html?document=${name}`);
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

/**
 * What a print of the pages draws against the computed lines: each page's computed lines missing
 * from that page of the PDF, in order, and each forced block whose lines the print document, laid
 * out for print, draws otherwise, read from its characters' line boxes as the editor's are
 * (DOCE-LABS-8.1), so a line the browser wrapped by itself is found though its text is all there.
 * `restyle` adds a stylesheet to the print document before it is read.
 */
async function printedLines(page: Page, kind: Print, restyle?: string) {
  const computed = await page.evaluate(() => window.regressionLab.textLines());
  const pages = computed.map((each) =>
    each.blocks.flatMap((block) => block.lines?.map((line) => line.text) ?? []),
  );
  const printed = await page.context().newPage();
  await printed.setViewportSize(ROOMY);
  const result = await printSnapshot(printed, await printOf(page, kind));
  if (!result.ok) throw new Error(`The print did not finish: ${result.reason}`);
  await printed.emulateMedia({ media: 'print' });
  if (restyle) await printed.addStyleTag({ content: restyle });
  const wrapped = await mismatchedLines(printed, computed, 'print');
  await printed.close();
  const pdf = Buffer.from(result.pdf);
  return { missing: missingFrom(result.pdf, pages), wrapped, fonts: pdfFontNames(pdf) };
}

// The faces the labs serve (labs/src/served-fonts.ts): Arimo, Cousine and Tinos for Arial, Courier
// New and Times New Roman, and Geist.
const SERVED = /^(?:Arimo|Cousine|Tinos|Geist)/u;
const unserved = (fonts: readonly string[]) => fonts.filter((font) => !SERVED.test(font));

// Each page's computed lines missing from that page of the PDF, in order.
function missingFrom(pdf: Uint8Array, pages: readonly (readonly string[])[]) {
  const texts = pdfPageTexts(Buffer.from(pdf), pages.length).map(squash);
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
    test(`DOCE-PAGINATION-13.5 DOCE-PAGINATION-13.8 prints the snapshot of ${name} on the computed lines in the served faces`, async ({
      page,
    }) => {
      await open(page, name);
      const { missing, wrapped, fonts } = await printedLines(page, 'snapshot');
      expect(missing, 'computed lines missing from the PDF').toEqual([]);
      expect(wrapped, 'forced blocks the print draws on other lines').toEqual([]);
      // DOCE-PAGINATION-13.8: the PDF embeds the served faces the lines were broken in, and no
      // local font.
      expect(fonts.length).toBeGreaterThan(0);
      expect(unserved(fonts), 'fonts in the PDF the host does not serve').toEqual([]);
    });

    test(`DOCE-PAGINATION-13.4 DOCE-PAGINATION-13.8 prints the layout of ${name} on the computed lines in the served faces, as the editor shows it`, async ({
      page,
      context,
    }) => {
      await open(page, name);
      const { missing, wrapped, fonts } = await printedLines(page, 'layoutPrint');
      expect(missing, 'computed lines missing from the PDF').toEqual([]);
      expect(wrapped, 'forced blocks the print draws on other lines').toEqual([]);
      expect(fonts.length).toBeGreaterThan(0);
      expect(unserved(fonts), 'fonts in the PDF the host does not serve').toEqual([]);
      await expectPrintEqualsEditor(page, context, () => printOf(page, 'layoutPrint'));
    });
  }

  test('DOCE-PAGINATION-13.4 prints linked code the engine wraps on the computed lines, as the editor shows it', async ({
    page,
    context,
  }) => {
    await open(page, 'linked-code');
    await loadWrappedLinkedCode(page);
    const { missing, wrapped } = await printedLines(page, 'layoutPrint');
    expect(missing, 'computed lines missing from the PDF').toEqual([]);
    expect(wrapped, 'forced blocks the print draws on other lines').toEqual([]);
    await expectPrintEqualsEditor(page, context, () => printOf(page, 'layoutPrint'));
  });

  test('DOCE-PAGINATION-13.5 a line the print wraps by itself fails the check, though its text is all there', async ({
    page,
  }) => {
    await open(page, 'heading-keep-with-next');
    // A column narrower than the one the engine fitted the lines to: print wraps them again.
    const { missing, wrapped } = await printedLines(
      page,
      'snapshot',
      'p.de-forced-lines { inline-size: 60% !important; }',
    );
    expect(missing).toEqual([]);
    expect(wrapped.length).toBeGreaterThan(0);
    const [first] = wrapped;
    expect(first?.drawn?.length ?? 0).toBeGreaterThan(first?.computed.length ?? 0);
  });

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

test('DOCE-PAGINATION-13.10 DOCE-PAGINATION-9.16 prints and views the layout in the document language', async ({
  page,
}) => {
  await open(page, 'page-breaks-and-rules');
  // The document in Turkish, on a template in English.
  await page.evaluate(() => {
    const file = window.regressionLab.stored();
    if (!file) throw new Error('The regression lab holds no document');
    window.regressionLab.load({ ...file, language: 'tr' });
  });
  await waitForLab(page);
  // The page around the editor names another language, which the layout never takes.
  await page
    .locator('.lab-document-editor')
    .evaluate((editor) => editor.setAttribute('lang', 'de'));
  await page.evaluate(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return window.stressLab.whenSettled();
  });
  expect(await page.evaluate(() => window.regressionLab.layout()?.language)).toBe('tr');
  const languageOf = (html: string) =>
    /^<!doctype html><html(?: lang="([^"]*)")?>/u.exec(html)?.[1] ?? null;
  expect(languageOf(await printOf(page, 'snapshot'))).toBe('tr');
  expect(languageOf(await printOf(page, 'layoutPrint'))).toBe('tr');
  expect(await page.evaluate(() => window.regressionLab.showViewer())).toBe(true);
  const viewer = page.getByRole('document', { name: 'Viewed document' });
  await expect(viewer).toHaveAttribute('lang', 'tr');
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
});
