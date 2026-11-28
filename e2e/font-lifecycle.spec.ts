import type { Page } from '@playwright/test';
import type { RegressionProbe } from '../labs/src/regression/regression-probe.js';
import { expect, test, waitForLab } from './fixtures.js';

// The served fonts through an editor's and a viewer's life (specs/PAGINATION.md
// DOCE-PAGINATION-12.7, DOCE-PAGINATION-12.8): the regression lab's long-mixed document with
// served Arimo, Cousine and Tinos, or Cousine's files under every family
// (`fonts=cousine`), so a swapped adapter or a second surface is told apart by its lines and widths.

declare global {
  interface Window {
    regressionLab: RegressionProbe;
  }
}

async function open(page: Page, fonts: 'lab' | 'cousine' = 'lab') {
  await page.goto(`regression.html?document=long-mixed&fonts=${fonts}`);
  await waitForLab(page);
}

// How many lines the engine laid the document's text blocks out on.
const lineCount = (page: Page) =>
  page.evaluate(() =>
    window.regressionLab
      .textLines()
      .flatMap((each) => each.blocks)
      .reduce((count, block) => count + (block.lines?.length ?? 0), 0),
  );

// The start of each face file a snapshot of the pages holds, by family, which tells the files
// apart.
const snapshotFiles = (page: Page) =>
  page.evaluate(() => {
    const html = window.regressionLab.snapshot() ?? '';
    const files = [
      ...html.matchAll(/font-family: "([^"]+)"; src: url\(data:[^;]+;base64,(.{64})/gu),
    ];
    return [...new Set(files.map(([, family, start]) => `${family ?? ''} ${start ?? ''}`))].sort();
  });

// The width of the text of the first forced block in a surface, which its font decides.
const textWidth = (page: Page, surface: string) =>
  page.evaluate((selector) => {
    const block = document.querySelector(`${selector} .pm-page .pm-page-content .de-forced-lines`);
    if (!block) return null;
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let width = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) width += rect.width;
    }
    return width;
  }, surface);

test.describe('a fonts adapter replaced while the editor shows', () => {
  test('DOCE-PAGINATION-12.7 lays out, draws and exports with the new adapter, keeping the selection', async ({
    page,
  }) => {
    await open(page, 'cousine');
    const fresh = { lines: await lineCount(page), files: await snapshotFiles(page) };
    await open(page);
    const before = { lines: await lineCount(page), files: await snapshotFiles(page) };
    expect(before.lines).not.toBe(fresh.lines);
    expect(before.files).not.toEqual(fresh.files);
    await page.evaluate(() => window.regressionLab.selectJoined(5, 12));
    await page.evaluate(() => window.regressionLab.setFonts('cousine'));
    await expect.poll(() => lineCount(page)).toBe(fresh.lines);
    await expect.poll(() => snapshotFiles(page)).toEqual(fresh.files);
    expect(await page.evaluate(() => window.regressionLab.selected())).toEqual([5, 12]);
  });

  test('DOCE-PAGINATION-12.7 never lays out or draws with an adapter replaced before its files came', async ({
    page,
  }) => {
    await open(page, 'cousine');
    const fresh = await lineCount(page);
    const freshWidth = await textWidth(page, '.lab-document-editor');
    await open(page);
    // The slow adapter's files come a second after it was replaced.
    await page.evaluate(() => {
      window.regressionLab.setFonts('slow');
    });
    await page.evaluate(() => {
      window.regressionLab.setFonts('cousine');
    });
    await expect.poll(() => lineCount(page)).toBe(fresh);
    // Once the slow adapter has answered every request, and a frame later, nothing has moved.
    await page.waitForFunction(() => {
      const { asked, answered } = window.regressionLab.fontRequests();
      return asked > 0 && asked === answered;
    });
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => done(null))));
    expect(await lineCount(page)).toBe(fresh);
    expect(await textWidth(page, '.lab-document-editor')).toBeCloseTo(freshWidth ?? 0, 1);
    // Only the new adapter's faces are in the document: four of each served family.
    const arial = await page.evaluate(
      () => [...document.fonts].filter((face) => face.family.replace(/"/gu, '') === 'Arial').length,
    );
    expect(arial).toBe(4);
  });
});

test.describe('font files that fail to arrive', () => {
  test('DOCE-PAGINATION-12.5 asks again for files whose first load failed, and pages the document once they arrive', async ({
    page,
  }) => {
    await page.goto('regression.html?document=long-mixed&fonts=flaky');
    const root = page.locator('.de-document-editor').first();
    await expect(root).toHaveAttribute('data-text-layout-reason', 'files-failed');
    await expect(root).toHaveAttribute('data-layout', 'web');
    // A second later the editor asks again by itself, and the pages are laid out with the files.
    await expect(root).toHaveAttribute('data-text-layout', 'pretext');
    await expect(root).not.toHaveAttribute('data-text-layout-reason');
    await waitForLab(page);
    await expect.poll(() => lineCount(page)).toBeGreaterThan(0);
    await expect(page.getByText('The pages cannot be laid out')).toHaveCount(0);
    expect(await page.evaluate(() => window.regressionLab.fontRequests().asked)).toBe(2);
  });
});

test.describe('surfaces drawing other files under one family', () => {
  test('DOCE-PAGINATION-12.8 keeps each surface in its own files through mount and unmount', async ({
    page,
  }) => {
    await page.goto('regression.html');
    await waitForLab(page);
    await page.evaluate(() => {
      const text = 'The widths of these letters differ between the two served faces.';
      window.regressionLab.load(
        {
          formatVersion: 1,
          sections: [{ content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }],
        },
        {
          formatVersion: 1,
          id: 'stacked-families',
          styles: { paragraph: { font: 'Arial, serif' } },
        },
      );
    });
    const paragraph = '.lab-document-editor .pm-page-content p.de-forced-lines';
    await expect(page.locator(paragraph)).toHaveText(/widths of these letters/u);
    await page.evaluate(() => window.regressionLab.drawAllLines(true));
    expect(await page.evaluate(() => window.regressionLab.showViewer())).toBe(true);
    const viewer = '[aria-label="Viewed document"]';
    const second = '[aria-label="Viewed document 2"]';
    await expect(page.locator(`${viewer} .pm-page[data-drawn]`).first()).toBeVisible();
    const alone = {
      editor: await textWidth(page, '.lab-document-editor'),
      viewer: await textWidth(page, viewer),
    };
    expect(alone.viewer).toBeCloseTo(alone.editor ?? 0, 1);
    expect(await page.evaluate(() => window.regressionLab.showTwoViewers())).toBe(true);
    await expect(page.locator(`${second} .pm-page[data-drawn]`).first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const familyOf = (surface: string) =>
      page
        .locator(`${surface} .pm-page-content p.de-forced-lines`)
        .first()
        .evaluate((element) => getComputedStyle(element).fontFamily);
    expect(await familyOf(viewer)).toMatch(/Arial,.*Times New Roman/u);
    expect(await familyOf(second)).toMatch(/Arial de-\d+.*,.*Times New Roman de-\d+/u);
    // The second viewer draws Cousine; the editor and the first viewer keep their own files.
    await expect
      .poll(async () => Math.abs(((await textWidth(page, second)) ?? 0) - (alone.viewer ?? 0)))
      .toBeGreaterThan(5);
    expect(await textWidth(page, viewer)).toBeCloseTo(alone.viewer ?? 0, 1);
    expect(await textWidth(page, '.lab-document-editor')).toBeCloseTo(alone.editor ?? 0, 1);
    await page.evaluate(() => window.regressionLab.keepViewers(1));
    await expect(page.locator(second)).toHaveCount(0);
    expect(await textWidth(page, viewer)).toBeCloseTo(alone.viewer ?? 0, 1);
    expect(await textWidth(page, '.lab-document-editor')).toBeCloseTo(alone.editor ?? 0, 1);
  });
});
