import type { Page } from '@playwright/test';
import type { RegressionProbe } from '../labs/src/regression/regression-probe.js';
import type { StressProbe } from '../labs/src/stress/stress-probe.js';
import tablesTemplate from '../test/fixtures/documents/templates/regression-tables.json' with { type: 'json' };
import { expect, test, waitForLab } from './fixtures.js';

// A footnote in a table's repeated header row, numbered per page (specs/PAGINATION.md
// DOCE-PAGINATION-13.11): the editor, the print drawn from the layout and the read-only viewer
// number each occurrence by its own page, and each page's marker links to that page's entry and
// back.

declare global {
  interface Window {
    regressionLab: RegressionProbe;
    stressLab: StressProbe;
  }
}

const VIEWER = '.de-document-viewer';
const EDITOR = '.de-document-editor__content:not(.de-document-viewer *)';

// The long table with a note on the heading before it and one in its first header cell, under a
// template that numbers footnotes from 1 on each page.
async function openNotes(page: Page) {
  await page.goto('regression.html?document=table-long-repeated-header&textLayout=pretext');
  await waitForLab(page);
  await page.evaluate((template) => {
    const file = window.regressionLab.stored();
    if (!file) throw new Error('The regression lab holds no document');
    const note = (id: string, text: string) => ({
      type: 'footnote',
      attrs: { id },
      content: [{ type: 'text', text }],
    });
    const withNotes = JSON.parse(JSON.stringify(file), (_key, value: unknown) => {
      if (!value || typeof value !== 'object' || !('content' in value)) return value;
      const node = value as { type?: string; content: unknown[] };
      const [first] = node.content as { text?: string }[];
      if (node.type === 'heading' && first?.text?.startsWith('Long table'))
        return { ...node, content: [...node.content, note('before', 'Before the table.')] };
      if (node.type === 'paragraph' && first?.text === '#' && node.content.length === 1)
        return { ...node, content: [...node.content, note('head', 'In the header.')] };
      return value;
    }) as typeof file;
    window.regressionLab.load(withNotes, {
      ...template,
      id: 'regression-tables-page-notes',
      footnotes: { numbering: 'page' },
    } as Parameters<RegressionProbe['load']>[1]);
  }, tablesTemplate);
  await waitForLab(page);
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.regressionLab.drawAllLines(true);
    return window.stressLab.whenSettled();
  });
}

// Each page's footnote markers' numbers, in order.
const markerNumbers = (root: string) =>
  [...document.querySelectorAll(`${root} .pm-page`)].map((sheet) =>
    [...sheet.querySelectorAll('sup.footnote-reference')].map((each) => each.textContent.trim()),
  );

test.describe('a footnote in a repeated table header', () => {
  test('DOCE-PAGINATION-13.11 is numbered by its page in the editor, the print and the viewer', async ({
    page,
  }) => {
    await openNotes(page);
    const editor = await page.evaluate(markerNumbers, EDITOR);
    expect(editor.length, 'the table runs over many pages').toBeGreaterThan(5);
    expect(editor.slice(0, 3)).toEqual([['1', '2'], ['1'], ['1']]);
    const printed = await page.evaluate(() => {
      const html = window.regressionLab.layoutPrint() ?? '';
      const doc = new DOMParser().parseFromString(html, 'text/html');
      return [...doc.querySelectorAll('.pm-page')].map((sheet) => ({
        markers: [...sheet.querySelectorAll('sup.footnote-reference')].map((each) =>
          each.textContent.trim(),
        ),
        entries: [...sheet.querySelectorAll('.pm-footnote-entry-number')].map((each) =>
          each.textContent.trim(),
        ),
      }));
    });
    expect(printed.map((each) => each.markers)).toEqual(editor);
    expect(printed.map((each) => each.entries)).toEqual(editor);
    expect(await page.evaluate(() => window.regressionLab.showViewer())).toBe(true);
    await expect(page.locator(`${VIEWER} .pm-page[data-drawn]`)).toHaveCount(editor.length);
    expect(await page.evaluate(markerNumbers, VIEWER)).toEqual(editor);
  });

  test('DOCE-PAGINATION-13.11 links each page’s marker to that page’s entry and back in the viewer', async ({
    page,
  }) => {
    await openNotes(page);
    expect(await page.evaluate(() => window.regressionLab.showViewer(0))).toBe(true);
    const sheets = page.locator(`${VIEWER} .pm-page`);
    for (const index of [0, 1, 2]) {
      const sheet = sheets.nth(index);
      await sheet.scrollIntoViewIfNeeded();
      await expect(sheet).toHaveAttribute('data-drawn', 'true');
      const marker = sheet.locator('sup.footnote-reference[data-footnote-id="head"]');
      await marker.getByRole('link').click();
      const entry = sheet.locator('.pm-footnote-entry[data-footnote-id="head"]');
      await expect(entry).toBeInViewport();
      const suffix = index === 0 ? '' : `~${String(index + 1)}`;
      await expect(entry).toHaveAttribute('id', `fn-head${suffix}`);
      await entry.locator('.pm-footnote-entry-number').getByRole('link').click();
      await expect(marker).toBeInViewport();
      await expect(marker).toHaveAttribute('id', `fnref-head${suffix}`);
    }
    expect(new URL(page.url()).hash).toBe('');
  });
});
