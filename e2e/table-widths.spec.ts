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
const cell = (width?: number, sample = text): StoredNode => ({
  type: 'tableCell',
  ...(width ? { attrs: { colwidth: [width] } } : {}),
  content: [{ type: 'paragraph', content: [{ type: 'text', text: sample }] }],
});

const table = (
  label: string,
  widths: (number | undefined)[],
  attrs?: StoredNode['attrs'],
): StoredNode => ({
  type: 'table',
  ...(attrs ? { attrs } : {}),
  content: [
    { type: 'caption', content: [{ type: 'text', text: label }] },
    { type: 'tableRow', content: widths.map((width) => cell(width, text.slice(0, 108))) },
  ],
});

const editor = '.lab-document-editor .de-document-editor__content';

async function openWithTables(page: Page, document: DocumentFile) {
  await page.goto('regression.html');
  await waitForLab(page);
  await page.evaluate(([file, settings]) => window.regressionLab.load(file, settings), [
    document,
    template,
  ] as const);
}

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
      tableWidth: row.closest('table')?.getBoundingClientRect().width,
      figureWidth: row.closest('.doc-table-figure')?.getBoundingClientRect().width,
    })),
  );

async function expectOutputGeometry(page: Page, drawn: Awaited<ReturnType<typeof geometry>>) {
  expect(await page.evaluate(() => window.regressionLab.showViewer())).toBe(true);
  const viewer = '[aria-label="Viewed document"]';
  const cells = drawn.reduce((count, row) => count + row.widths.length, 0);
  await expect(page.locator(`${viewer} table td p[data-lines]`)).toHaveCount(cells);
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
}

test('DOCE-PAGINATION-10.5 draws the same mixed-width table in the editor, viewer and print', async ({
  page,
}) => {
  await openWithTables(page, file);
  await expect(page.locator(`${editor} table td p[data-lines]`)).toHaveCount(4);
  const drawn = await geometry(page, editor);
  expect(drawn).toHaveLength(2);
  for (const row of drawn) {
    expect(row.widths[0]).toBeCloseTo(199.5, 0);
    expect(row.widths[1]).toBeCloseTo(199.5, 0);
    expect(row.lines[0]).toBeGreaterThan(1);
    expect(row.lines[1]).toBe(row.lines[0]);
  }

  await expectOutputGeometry(page, drawn);
});

test('DOCE-PAGINATION-10.5 fits fully specified tables at their measured widths across outputs', async ({
  page,
}) => {
  const content = [
    table('Equal columns', [320, 320]),
    table('Unequal columns', [360, 280], { layout: 'center', border: 'table-border-none' }),
    table('Narrow table', [90, 110]),
  ];
  await openWithTables(page, {
    formatVersion: 1,
    sections: [
      {
        header: {
          content: [
            table('Fitted header table', [180, 120], { layout: 'fit-page-width' }),
            table('Narrow header table', [120, 100]),
          ],
        },
        content,
        footer: { content: [table('Unset footer table', [undefined, undefined])] },
      },
    ],
  });
  await expect(page.locator(`${editor} table td p[data-lines]`)).toHaveCount(12);
  const drawn = await geometry(page, editor);
  expect(drawn).toHaveLength(6);
  const expected = [
    [400, 239.4, 159.6],
    [221, 120, 100],
    [400, 199.5, 199.5],
    [400, 225, 175],
    [201, 90, 110],
    [400, 199.5, 199.5],
  ];
  for (const [index, row] of drawn.entries()) {
    const [tableWidth, first, second] = expected[index] ?? [];
    expect(row.tableWidth).toBeCloseTo(tableWidth ?? 0, 1);
    expect(row.figureWidth).toBeCloseTo(tableWidth ?? 0, 1);
    expect(row.widths[0]).toBeCloseTo(first ?? 0, 1);
    expect(row.widths[1]).toBeCloseTo(second ?? 0, 1);
  }
  await expectOutputGeometry(page, drawn);
});

test('DOCE-TABLES-2.4 DOCE-PAGINATION-10.5 redraws a resized table at its fitted width', async ({
  page,
}) => {
  await openWithTables(page, {
    formatVersion: 1,
    sections: [{ content: [table('Resizable table', [320, 320])] }],
  });
  await expect(page.locator(`${editor} table td p[data-lines]`)).toHaveCount(2);
  const first = page.locator(`${editor} table td`).first();
  await first.scrollIntoViewIfNeeded();
  const box = await first.boundingBox();
  if (!box) throw new Error('The first column is not drawn');
  const border = { x: box.x + box.width - 2, y: box.y + box.height / 2 };
  await page.mouse.move(border.x, border.y);
  await page.mouse.down();
  await page.mouse.move(border.x + 38, border.y, { steps: 6 });
  await expect.poll(async () => (await first.boundingBox())?.width).toBeGreaterThan(box.width);
  await expect(first).toHaveAttribute('data-colwidth', '320');
  await page.mouse.up();
  await expect(first).not.toHaveAttribute('data-colwidth', '320');
  const drawn = await geometry(page, editor);
  expect(drawn).toHaveLength(1);
  expect(drawn[0]?.tableWidth).toBeCloseTo(400, 1);
  expect(drawn[0]?.widths[0]).toBeGreaterThan(box.width);
  await expectOutputGeometry(page, drawn);
});
