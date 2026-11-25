import type { Page } from '@playwright/test';
import type { RegressionProbe } from '../labs/src/regression/regression-probe.js';
import type { DocumentFile, StoredNode, TemplateFile } from '../src/model/index.js';
import { expect, test, waitForLab } from './fixtures.js';

// Headers and footers that show the page's number take the room their text takes on each page
// (DOCE-PAGINATION-11.10): `Report` and a run of letters before the number fit on one line up to
// page 9 and wrap from page 10, or up to 99 and from 100, in the lab's served fonts, and every
// page's content stays between its header and its footer, read from the boxes the browser draws.

declare global {
  interface Window {
    regressionLab: RegressionProbe;
  }
}

const text = (value: string): StoredNode => ({ type: 'text', text: value });
const variable = (key: string): StoredNode => ({ type: 'variable', attrs: { key } });
const line = (...content: StoredNode[]): StoredNode => ({ type: 'paragraph', content });

const WORDS =
  'the controller reports each fault within one second and keeps a record of every report so ' +
  'that an operator can review the sequence of events after the fact';

// A narrow page whose header and footer show `Report`, letters and the page's number.
function template(letters: { header: string; footer: string }): TemplateFile {
  const report = (fill: string) => text(`Report ${fill} `);
  return {
    formatVersion: 1,
    id: 'region-page-numbers',
    page: {
      size: 'A6',
      orientation: 'portrait',
      margins: { top: '8mm', right: '24mm', bottom: '8mm', left: '24mm' },
    },
    header: { content: [line(report(letters.header), variable('page.current'))] },
    footer: { content: [line(report(letters.footer), variable('page.current'))] },
  } as TemplateFile;
}

// Paragraphs of the same words, enough for the pages asked for.
function documentOf(paragraphs: number): DocumentFile {
  const content = Array.from({ length: paragraphs }, () => line(text(WORDS)));
  return { formatVersion: 1, sections: [{ name: null, content }] } as DocumentFile;
}

async function open(page: Page, file: DocumentFile, own: TemplateFile) {
  await page.goto('regression.html?document=minimal-paragraph&debug');
  await waitForLab(page);
  await page.evaluate(([stored, settings]) => window.regressionLab.load(stored, settings), [
    file,
    own,
  ] as const);
  await page.waitForFunction(() => window.regressionLab.layout() !== null);
  await expect(page.locator('.de-document-editor').first()).toHaveAttribute(
    'data-layout-state',
    'settled',
    { timeout: 60_000 },
  );
}

const sheets = (page: Page) =>
  page.locator(':not(.de-document-viewer) > .de-document-editor__content .pm-page');

// A page's header and footer heights; how far its content and footer reach past their room, above
// its header's bottom, below its footer's top or past the page's own bottom margin, at most 0 when
// the page holds them; and the room its layout planned for its blocks (`debug`: used plus free)
// beside the room the browser left them between its header and its footer.
async function regionsOf(page: Page, index: number) {
  const sheet = sheets(page).nth(index);
  await sheet.scrollIntoViewIfNeeded();
  return sheet.evaluate((each) => {
    const header = each.querySelector('.pm-page-header')?.getBoundingClientRect();
    const footer = each.querySelector('.pm-page-footer')?.getBoundingClientRect();
    const blocks = [...(each.querySelector('.pm-page-content')?.children ?? [])].map((block) =>
      block.getBoundingClientRect(),
    );
    if (!header || !footer || !blocks.length) throw new Error('a page without its regions');
    const box = each.getBoundingClientRect();
    const bottom = box.bottom - parseFloat(getComputedStyle(each).paddingBottom);
    return {
      header: header.height,
      footer: footer.height,
      text: each.querySelector('.pm-page-header')?.textContent ?? '',
      past: Math.max(
        header.bottom - Math.min(...blocks.map((block) => block.top)),
        Math.max(...blocks.map((block) => block.bottom)) - footer.top,
        footer.bottom - bottom,
      ),
      planned: Number(each.dataset.debugUsed) + Number(each.dataset.debugFree),
      drawn: footer.top - header.bottom,
    };
  });
}

// Each page around a number's new digit holds its content, and the region wraps on the later one.
async function expectHeld(page: Page, around: number) {
  const before = await regionsOf(page, around - 2);
  const after = await regionsOf(page, around - 1);
  expect(before.text).toContain(String(around - 1));
  expect(after.text).toContain(String(around));
  // The test reaches the case it guards: the longer number wraps both regions.
  expect(after.header).toBeGreaterThan(before.header);
  expect(after.footer).toBeGreaterThan(before.footer);
  for (const each of [before, after]) {
    expect(each.past).toBeLessThanOrEqual(1);
    expect(each.drawn).toBeGreaterThanOrEqual(each.planned - 1);
  }
}

test.describe('headers and footers showing page numbers', () => {
  test('DOCE-PAGINATION-11.10 leaves pages 9 and 10 the header and footer room their numbers take', async ({
    page,
  }) => {
    const fill = `${'A'.repeat(20)}ii`;
    await open(page, documentOf(60), template({ header: fill, footer: fill }));
    expect(await sheets(page).count()).toBeGreaterThanOrEqual(11);
    await expectHeld(page, 10);
  });

  test('DOCE-PAGINATION-11.10 leaves pages 99 and 100 the header and footer room their numbers take', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const fill = `${'A'.repeat(19)}ii`;
    await open(page, documentOf(560), template({ header: fill, footer: fill }));
    expect(await sheets(page).count()).toBeGreaterThanOrEqual(101);
    await expectHeld(page, 100);
  });
});
