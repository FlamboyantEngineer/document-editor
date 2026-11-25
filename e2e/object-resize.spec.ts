import type { Page } from '@playwright/test';
import type { RegressionProbe } from '../labs/src/regression/regression-probe.js';
import type { DocumentFile } from '../src/model/index.js';
import { expect, test, waitForLab } from './fixtures.js';

// Resizing from the layout engine's boxes (specs/PAGINATION.md DOCE-PAGINATION-10.12): the sizes a
// column or row drag and leaving a figure's fit store are the same at every zoom, as the
// `chromium-dpr-*` projects check at every device pixel ratio.

declare global {
  interface Window {
    regressionLab: RegressionProbe;
  }
}

// Zooms at which a drag of 40 of the document's pixels is a whole number of screen pixels.
const ZOOMS = [100, 150, 75];
const GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

const text = (value: string) => [{ type: 'paragraph', content: [{ type: 'text', text: value }] }];
const cell = (value: string, width: number) => ({
  type: 'tableCell',
  attrs: { colwidth: [width] },
  content: text(value),
});

const FILE = {
  formatVersion: 1,
  template: { id: 'regression-base' },
  sections: [
    {
      name: 'body',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Parts' }] },
        {
          type: 'table',
          attrs: { layout: 'left' },
          content: [
            { type: 'tableRow', content: [cell('Pump', 200), cell('P-1', 300)] },
            { type: 'tableRow', content: [cell('Valve', 200), cell('V-1', 300)] },
          ],
        },
        {
          type: 'figure',
          attrs: { src: GIF, alt: 'Plot plan', width: 300, height: 150, layout: 'fit-page-width' },
          content: [{ type: 'caption', content: [{ type: 'text', text: 'Plot plan' }] }],
        },
      ],
    },
  ],
} as unknown as DocumentFile;

const content = (page: Page) => page.locator('.de-document-editor__content');
const cellOf = (page: Page, value: string) => content(page).locator('td', { hasText: value });

async function open(page: Page, zoom: number) {
  await page.goto(`regression.html?zoom=${String(zoom)}`);
  await waitForLab(page);
  await page.evaluate((file) => window.regressionLab.load(file), FILE);
  await expect(cellOf(page, 'Pump')).toBeVisible();
  await expect(page.locator('.de-document-editor')).toHaveAttribute('data-layout-state', 'settled');
}

// The stored table's cells and figure, as the writer's document holds them.
const stored = (page: Page) =>
  page.evaluate(() => {
    const sections = window.regressionLab.stored()?.sections ?? [];
    const nodes = sections.flatMap((section) => section.content ?? []);
    const table = nodes.find((node) => node.type === 'table');
    const figure = nodes.find((node) => node.type === 'figure');
    const cells = (table?.content ?? []).flatMap((row) =>
      (row.content ?? []).map((each) => ({
        colwidth: each.attrs?.colwidth,
        rowHeight: each.attrs?.rowHeight,
      })),
    );
    return { cells, figure: figure?.attrs };
  });

// Drags from a point by an offset in the document's pixels, on screen at a zoom.
async function drag(page: Page, from: { x: number; y: number }, by: { x: number; y: number }) {
  const scale = await content(page).evaluate((element) => {
    const view = (element.closest('.ProseMirror') ??
      element.querySelector('.ProseMirror')) as HTMLElement;
    return view.getBoundingClientRect().width / view.offsetWidth;
  });
  await page.mouse.move(from.x - 10 * Math.sign(by.x || 1), from.y);
  await page.mouse.move(from.x, from.y, { steps: 3 });
  await page.mouse.down();
  await page.mouse.move(from.x + by.x * scale, from.y + by.y * scale, { steps: 6 });
  await page.mouse.up();
}

test('DOCE-PAGINATION-10.12 DOCE-TABLES-2.4 stores the same column widths at every zoom', async ({
  page,
}) => {
  for (const zoom of ZOOMS) {
    await open(page, zoom);
    const box = await cellOf(page, 'Pump').boundingBox();
    if (!box) throw new Error('The cell is not drawn');
    await drag(page, { x: box.x + box.width - 1, y: box.y + box.height / 2 }, { x: 40, y: 0 });
    await expect(cellOf(page, 'Pump')).toHaveAttribute('data-colwidth', '240');
    const { cells } = await stored(page);
    expect(
      cells.map((each) => each.colwidth),
      `widths at ${String(zoom)}%`,
    ).toEqual([[240], [260], [240], [260]]);
  }
});

test('DOCE-PAGINATION-10.12 DOCE-TABLES-3.6 stores the same row height at every zoom, laid out at the height shown', async ({
  page,
}) => {
  const heights = new Set<unknown>();
  for (const zoom of ZOOMS) {
    await open(page, zoom);
    const pump = cellOf(page, 'Pump');
    const box = await pump.boundingBox();
    if (!box) throw new Error('The cell is not drawn');
    const unscaled = await pump.evaluate((element) => (element as HTMLElement).offsetHeight);
    await drag(page, { x: box.x + box.width / 2, y: box.y + box.height - 2 }, { x: 0, y: 40 });
    await expect(pump).toHaveAttribute('data-row-height', /^\d+$/);
    heights.add((await stored(page)).cells[0]?.rowHeight);
    // Shown at its laid-out height plus the drag, rounded to whole pixels when it is set.
    await expect
      .poll(async () =>
        Math.abs(
          (await pump.evaluate((element) => (element as HTMLElement).offsetHeight)) -
            (unscaled + 40),
        ),
      )
      .toBeLessThanOrEqual(1);
  }
  // The same number at every zoom and, in the chromium-dpr projects, every device pixel ratio: the
  // row's laid-out height on the lab fonts plus 40, less its cells' padding and borders.
  expect([...heights]).toEqual([61]);
});

test('DOCE-PAGINATION-10.12 DOCE-OBJECTS-1.11 keeps the same fitted size at every zoom when a figure leaves the fit', async ({
  page,
}) => {
  const sizes = new Set<string>();
  for (const zoom of ZOOMS) {
    await open(page, zoom);
    const figure = content(page).locator('figure').first();
    await figure.scrollIntoViewIfNeeded();
    await figure.locator('img').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Align' }).click();
    await page
      .getByRole('menuitemcheckbox', { name: 'Left' })
      .or(page.getByRole('menuitemradio', { name: 'Left' }))
      .or(page.getByRole('menuitem', { name: 'Left' }))
      .click();
    await expect.poll(async () => (await stored(page)).figure?.layout).toBe('left');
    const attrs = (await stored(page)).figure;
    sizes.add(`${String(attrs?.width)}x${String(attrs?.height)}`);
  }
  // The regression template's page content width in whole pixels no wider than it, the
  // height in the stored 2:1 proportions, at every zoom and device pixel ratio.
  expect([...sizes]).toEqual(['642x321']);
});
