import type { Page } from '@playwright/test';
import type { RegressionProbe } from '../labs/src/regression/regression-probe.js';
import type { DocumentFile, StoredNode, TemplateFile } from '../src/model/index.js';
import { expect, test, waitForLab } from './fixtures.js';

declare global {
  interface Window {
    regressionLab: RegressionProbe;
  }
}

const template: TemplateFile = {
  formatVersion: 1,
  id: 'mixed-columns',
  page: { size: 'US Letter', margins: { left: '208px', right: '208px' } },
};

const text = 'A paragraph that wraps more often when its column is narrow. '.repeat(4);
const cell = (width?: number): StoredNode => ({
  type: 'tableCell',
  ...(width ? { attrs: { colwidth: [width] } } : {}),
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

const file: DocumentFile = {
  formatVersion: 1,
  sections: [
    {
      content: [
        {
          type: 'table',
          content: [
            { type: 'caption', content: [{ type: 'text', text: 'Widths' }] },
            { type: 'tableRow', content: [cell(320), cell()] },
            { type: 'tableRow', content: [cell(320), cell()] },
          ],
        },
      ],
    },
  ],
};

const geometry = (page: Page, root: string) =>
  page.locator(`${root} .pm-page table tbody tr`).evaluateAll((rows) =>
    rows.map((row) => ({
      height: row.getBoundingClientRect().height,
      widths: Array.from(row.children, (cell) => cell.getBoundingClientRect().width),
      lines: Array.from(row.querySelectorAll('p'), (paragraph) => Number(paragraph.dataset.lines)),
    })),
  );

test('DOCE-PAGINATION-10.5 draws the same mixed-width table in the editor, viewer and print', async ({
  page,
}) => {
  await page.goto('regression.html?textLayout=pretext');
  await waitForLab(page);
  await page.evaluate(([content, settings]) => window.regressionLab.load(content, settings), [
    file,
    template,
  ] as const);
  const editor = '.lab-document-editor .de-document-editor__content';
  await expect(page.locator(`${editor} table td p[data-lines]`)).toHaveCount(4);
  const drawn = await geometry(page, editor);
  expect(drawn).toHaveLength(2);
  for (const row of drawn) {
    expect(row.widths[0]).toBeCloseTo(199.5, 0);
    expect(row.widths[1]).toBeCloseTo(199.5, 0);
    expect(row.lines[0]).toBeGreaterThan(1);
    expect(row.lines[1]).toBe(row.lines[0]);
  }

  expect(await page.evaluate(() => window.regressionLab.showViewer())).toBe(true);
  const viewer = '[aria-label="Viewed document"]';
  await expect(page.locator(`${viewer} table td p[data-lines]`)).toHaveCount(4);
  expect(await geometry(page, viewer)).toEqual(drawn);

  const html = await page.evaluate(
    (href) => window.regressionLab.layoutPrint({ stylesheets: [href] }) ?? '',
    new URL('build/reference.css', page.url()).href,
  );
  const print = await page.context().newPage();
  await print.setContent(html, { waitUntil: 'load' });
  await print.emulateMedia({ media: 'print' });
  await print.evaluate(() => document.fonts.ready);
  expect(await geometry(print, '.de-document-editor')).toEqual(drawn);
  await print.close();
});
