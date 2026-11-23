import type { Page } from '@playwright/test';
import type { RegressionProbe } from '../labs/src/regression/regression-probe.js';
import type { StressProbe } from '../labs/src/stress/stress-probe.js';
import { printSnapshot } from '../src/document/index.js';
import type { DocumentFile, TemplateFile } from '../src/model/index.js';
import { readBlockGeometry } from './block-geometry.js';
import { expect, test, waitForLab } from './fixtures.js';
import { pdfPageTexts } from './print-fidelity.js';

// Suggestions in each markup (specs/PAGINATION.md DOCE-PAGINATION-11.12, specs/DOCUMENT-EDITOR.md
// DOCE-EDITOR-6.16): a suggestion stored with only its comment thread's id is left out or shown as
// plain text by the viewer, the print of the pages' layout and the snapshot as the markup says,
// and the pages are laid out without the room the suggestions the markup hides would take, so a
// print as if accepted has no pages left blank by a long deletion.

declare global {
  interface Window {
    regressionLab: RegressionProbe;
    stressLab: StressProbe;
  }
}

const ROOMY = { width: 1600, height: 1800 };
const MARKUPS = ['all', 'final', 'original'] as const;
type Markup = (typeof MARKUPS)[number];

// What each markup shows of `comments-and-suggestions.json`'s thread-only insertion and deletion.
const SHOWN: Readonly<Record<Markup, { insertion: boolean; deletion: boolean }>> = {
  all: { insertion: true, deletion: true },
  final: { insertion: true, deletion: false },
  original: { insertion: false, deletion: true },
};

async function open(page: Page, query = '') {
  await page.setViewportSize(ROOMY);
  await page.goto(`regression.html?document=comments-and-suggestions&textLayout=pretext${query}`);
  await waitForLab(page);
  // Under load the first layout can still be pending or provisional when the lab is ready.
  await page.evaluate(() => window.stressLab.whenSettled());
  await page.waitForFunction(() => window.regressionLab.layout()?.provisional === false);
}

// The editor's own pages, not its measuring view's nor the viewer's.
const editorPages = (page: Page) =>
  page.locator(':not(.de-document-viewer) > .de-document-editor__content .pm-page');

const stylesheet = (page: Page) => new URL('build/reference.css', page.url()).href;

// The text a standalone page shows, as a reader sees it, and how many suggestion elements it has.
async function shownBy(page: Page, html: string) {
  const shown = await page.context().newPage();
  await shown.setContent(html, { waitUntil: 'load' });
  // The text can show a moment after the load, once the page's stylesheet and faces apply.
  await expect
    .poll(() => shown.evaluate(() => document.body.innerText.trim().length), {
      message: 'the page shows its text',
    })
    .toBeGreaterThan(0);
  const result = await shown.evaluate(() => ({
    text: document.body.innerText.replace(/\s+/gu, ' '),
    marked: document.querySelectorAll('ins, del').length,
  }));
  await shown.close();
  return result;
}

// A standalone page printed to PDF, as a host prints it, with its text page by page.
async function printed(page: Page, html: string) {
  const sheet = await page.context().newPage();
  const result = await printSnapshot(sheet, html);
  await sheet.close();
  if (!result.ok) throw new Error(`The print did not finish: ${result.reason}`);
  const pdf = Buffer.from(result.pdf);
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page\b/gu) ?? []).length;
  return { pages, texts: pdfPageTexts(pdf, pages) };
}

const layoutPrint = (page: Page, markup: Markup) =>
  page.evaluate(
    ([shown, href]) => window.regressionLab.layoutPrint({ markup: shown, stylesheets: [href] }),
    [markup, stylesheet(page)] as const,
  );

// On a miss, the message quotes the text around the suggestions, to tell a leak from a bad break.
const expectShown = (text: string, markup: Markup) => {
  const around = text.slice(
    Math.max(0, text.indexOf('Text with') - 40),
    text.indexOf('Text with') + 120,
  );
  expect(text.includes('an insertion'), `${markup}: the insertion in "${around}"`).toBe(
    SHOWN[markup].insertion,
  );
  expect(text.includes('a deletion'), `${markup}: the deletion in "${around}"`).toBe(
    SHOWN[markup].deletion,
  );
};

test.describe('DOCE-PAGINATION-11.12 suggestions as the markup shows them', () => {
  test('DOCE-EDITOR-6.16 the layout print and its PDF leave thread-only suggestions out as each markup says', async ({
    page,
  }) => {
    await open(page);
    for (const markup of MARKUPS) {
      const html = await layoutPrint(page, markup);
      if (!html) throw new Error('The editor gave no layout');
      expect(html).toContain(`data-markup="${markup}"`);
      const { text, marked } = await shownBy(page, html);
      expectShown(text, markup);
      // Only all the markup keeps the suggestions' elements; the others show plain text.
      if (markup === 'all') expect(marked).toBeGreaterThan(0);
      else expect(marked).toBe(0);
      const pdf = await printed(page, html);
      expectShown(pdf.texts.join(' ').replace(/\s+/gu, ' '), markup);
    }
  });

  test('DOCE-EDITOR-6.16 the viewer and the snapshot show thread-only suggestions as each markup says', async ({
    page,
  }) => {
    await open(page);
    for (const markup of MARKUPS) {
      await page.evaluate((shown) => window.regressionLab.showViewer(Infinity, shown), markup);
      const viewer = page.locator('.de-document-viewer');
      await expect(viewer).toHaveAttribute('data-markup', markup);
      expectShown((await viewer.innerText()).replace(/\s+/gu, ' '), markup);
      const snapshot = await page.evaluate(
        ([shown, href]) =>
          window.regressionLab.snapshot({ markup: shown, stylesheets: [href] }) ?? '',
        [markup, stylesheet(page)] as const,
      );
      expectShown((await shownBy(page, snapshot)).text, markup);
    }
    // The editor's own pages keep showing every suggestion after each layout for another markup.
    expectShown((await editorPages(page).first().innerText()).replace(/\s+/gu, ' '), 'all');
  });

  test('DOCE-EDITOR-6.16 the editor in a markup hides thread-only suggestions on its pages', async ({
    page,
  }) => {
    await open(page, '&markup=final');
    const pages = editorPages(page);
    expectShown((await pages.first().innerText()).replace(/\s+/gu, ' '), 'final');
  });
});

// A page whose content is 262 by about 167 CSS pixels.
const SMALL_PAGE = {
  formatVersion: 1,
  id: 'suggestion-markup',
  page: {
    size: 'A7',
    orientation: 'portrait',
    margins: { top: '30mm', right: '2.5mm', bottom: '30mm', left: '2.5mm' },
  },
} as unknown as TemplateFile;

// One paragraph whose middle is a suggested insertion or deletion of many words, with an id.
function longSuggestion(kind: 'insertion' | 'deletion'): DocumentFile {
  const content = [
    { type: 'text', text: 'Kept words before. ' },
    {
      type: 'text',
      text: 'removed text '.repeat(460),
      marks: [{ type: kind, attrs: { id: 'long', author: 'lab' } }],
    },
    { type: 'text', text: 'Kept words after.' },
  ];
  return {
    formatVersion: 1,
    sections: [{ name: null, content: [{ type: 'paragraph', attrs: { id: 'p1' }, content }] }],
  } as unknown as DocumentFile;
}

async function load(page: Page, file: DocumentFile) {
  await page.evaluate(([stored, own]) => window.regressionLab.load(stored, own), [
    file,
    SMALL_PAGE,
  ] as const);
  await page.waitForFunction(() => window.regressionLab.layout() !== null);
  await page.evaluate(() => window.stressLab.whenSettled());
}

const pagesOf = (page: Page, markup: Markup) =>
  page.evaluate(
    (shown) => (window.regressionLab.layout(shown)?.doc.content as unknown[] | undefined) ?? [],
    markup,
  );

const sheetsIn = (layout: unknown[]) =>
  layout.reduce<number>(
    (count, section) => count + ((section as { content?: unknown[] }).content?.length ?? 0),
    0,
  );

test.describe('DOCE-PAGINATION-11.12 pages laid out in a markup', () => {
  for (const kind of ['deletion', 'insertion'] as const) {
    const hiding: Markup = kind === 'deletion' ? 'final' : 'original';
    const showing: Markup = kind === 'deletion' ? 'original' : 'final';
    test(`a long ${kind} takes no room as ${hiding}, and its pages as ${showing}`, async ({
      page,
    }) => {
      await open(page);
      await load(page, longSuggestion(kind));
      const all = sheetsIn(await pagesOf(page, 'all'));
      expect(all).toBeGreaterThan(10);
      expect(sheetsIn(await pagesOf(page, showing))).toBe(all);
      expect(sheetsIn(await pagesOf(page, hiding))).toBe(1);
      // The PDF of the layout print has as many sheets as the layout, each with text on it.
      for (const markup of [hiding, showing]) {
        const html = await layoutPrint(page, markup);
        if (!html) throw new Error('The editor gave no layout');
        const pdf = await printed(page, html);
        expect(pdf.pages, markup).toBe(markup === hiding ? 1 : all);
        expect(
          pdf.texts.filter((text) => !/\S/u.test(text)),
          markup,
        ).toEqual([]);
        expect(pdf.texts.join(' ').includes('removed'), markup).toBe(markup === showing);
      }
    });
  }

  test('the editor shown as final lays the deletion out as taking no room, drawn as planned', async ({
    page,
  }) => {
    await open(page, '&markup=final&debug');
    await load(page, longSuggestion('deletion'));
    const pages = editorPages(page);
    await expect(pages).toHaveCount(1);
    await expect(pages.first()).toContainText('Kept words before. Kept words after.', {
      useInnerText: true,
    });
    await page.evaluate(() => window.regressionLab.drawAllLines(true));
    expect(await readBlockGeometry(page)).toEqual([]);
    expect(await page.evaluate(() => window.regressionLab.wrappedLines())).toEqual([]);
  });
});
