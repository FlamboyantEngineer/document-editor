import type { Page } from '@playwright/test';
import type { RegressionDocumentName } from '../labs/src/regression/regression-documents.js';
import type { RegressionProbe } from '../labs/src/regression/regression-probe.js';
import type { StressProbe } from '../labs/src/stress/stress-probe.js';
import {
  blocksToRead,
  misplacedLineNumbers,
  readDrawnLines,
  readDrawnPages,
} from './drawn-lines.js';
import { expect, test, waitForLab } from './fixtures.js';
import { loadWrappedLinkedCode } from './wrapped-linked-code.js';

// The read-only viewer (specs/PAGINATION.md DOCE-PAGINATION-13.6): the pages' layout drawn without
// the editor shows every page the engine computed, each forced block on the engine's lines, draws
// only the pages near the viewport, numbers a page drawn on its own on from the pages before, and
// follows a link to a page it has not drawn (DOCE-PAGINATION-13.9).

declare global {
  interface Window {
    regressionLab: RegressionProbe;
    stressLab: StressProbe;
  }
}

const NAMES: readonly RegressionDocumentName[] = [
  'long-mixed',
  'heading-keep-with-next',
  'mixed-geometry-repeated-sections',
  'footnote-heavy',
  'long-ordered-list',
  'code-blocks',
  'linked-code',
  'code-block-stress',
  'inline-geometry',
];

const VIEWER = '.de-document-viewer';
const SHEETS = `${VIEWER} .pm-page`;

// Spaces as the stored text holds them: a no-break space a browser kept at a writer's edge is a space.
const plain = (text: string) => text.replaceAll(' ', ' ');

async function open(page: Page, name: RegressionDocumentName, rendering = 'dom') {
  await page.goto(`regression.html?document=${name}&rendering=${rendering}`);
  await waitForLab(page);
  await page.evaluate(async () => {
    await document.fonts.ready;
    return window.stressLab.whenSettled();
  });
}

async function showViewer(page: Page, overscan?: number) {
  expect(await page.evaluate((each) => window.regressionLab.showViewer(each), overscan)).toBe(true);
  await expect(page.locator(SHEETS).first()).toBeAttached();
}

// The computed lines of each forced block, by page, and the lines the viewer draws for each.
async function linesAgainstComputed(page: Page) {
  const computed = await page.evaluate(() => window.regressionLab.textLines());
  const asked = blocksToRead(computed);
  const drawn = await readDrawnLines(page, asked, 'viewer');
  const mismatches = asked.flatMap((block, index) => {
    const { lines } = block;
    const own = drawn[index]?.map(plain) ?? null;
    const same = own?.length === lines.length && own.every((text, at) => text === lines[at]);
    return same ? [] : [{ page: block.page, block: block.elementId, computed: lines, drawn: own }];
  });
  return { computed, mismatches };
}

test.describe('the read-only viewer', () => {
  for (const name of NAMES) {
    test(`DOCE-PAGINATION-13.6 draws ${name} on the computed pages and lines`, async ({ page }) => {
      await open(page, name);
      await showViewer(page);
      const { computed, mismatches } = await linesAgainstComputed(page);
      const pages = await readDrawnPages(page, '.de-forced-lines', 'viewer');
      expect(pages.pages).toBe(computed.length);
      expect(pages.forced).toEqual(
        computed.map(({ blocks }) =>
          blocks
            .filter((block) => block.lines !== null)
            .map((block) => `${block.elementId}#${String(block.part)}`),
        ),
      );
      expect(mismatches).toEqual([]);
      // Each code line number sits on its line's first row, as in the editor.
      expect(await misplacedLineNumbers(page, 'viewer')).toEqual([]);
    });
  }

  test('DOCE-PAGINATION-13.6 draws code and linked code the engine wraps on the computed lines, with their gutters', async ({
    page,
  }) => {
    await open(page, 'linked-code');
    await loadWrappedLinkedCode(page);
    await page.evaluate(() => window.stressLab.whenSettled());
    await showViewer(page);
    const { mismatches } = await linesAgainstComputed(page);
    expect(mismatches).toEqual([]);
    const wraps = page.locator(`${VIEWER} .linked-code-block code .de-forced-lines__end`);
    expect(await wraps.count(), 'lines the engine wrapped in linked code').toBeGreaterThan(4);
    expect(await misplacedLineNumbers(page, 'viewer'), 'code line numbers off their lines').toEqual(
      [],
    );
  });

  test('DOCE-PAGINATION-13.6 draws the same pages as HTML beside pages painted into canvases', async ({
    page,
  }) => {
    await open(page, 'long-mixed', 'html-canvas');
    await showViewer(page);
    const { computed, mismatches } = await linesAgainstComputed(page);
    expect((await readDrawnPages(page, '.de-forced-lines', 'viewer')).pages).toBe(computed.length);
    expect(mismatches).toEqual([]);
    await expect(page.locator(`${VIEWER} canvas`)).toHaveCount(0);
  });

  test('DOCE-PAGINATION-13.6 draws only the pages near the viewport', async ({ page }) => {
    await open(page, 'long-mixed');
    await showViewer(page, 1);
    const sheets = page.locator(SHEETS);
    const total = await sheets.count();
    expect(total).toBeGreaterThan(4);
    await expect(sheets.first()).toHaveAttribute('data-drawn', 'true');
    await expect(sheets.last()).not.toHaveAttribute('data-drawn');
    // Every sheet keeps its page's size, so the viewer scrolls the whole document.
    const sizes = await sheets.evaluateAll((each) =>
      each.map((sheet) => Math.round(sheet.getBoundingClientRect().height)),
    );
    expect(new Set(sizes).size).toBeLessThanOrEqual(2);
    expect(Math.min(...sizes)).toBeGreaterThan(400);
    await sheets.last().scrollIntoViewIfNeeded();
    await expect(sheets.last()).toHaveAttribute('data-drawn', 'true');
    await expect(sheets.first()).not.toHaveAttribute('data-drawn');
    const drawn = await page.locator(`${SHEETS}[data-drawn]`).count();
    expect(drawn).toBeLessThanOrEqual(4);
  });

  test('DOCE-PAGINATION-13.13 draws every page while the host page prints, and only the near ones after', async ({
    page,
  }) => {
    await open(page, 'long-mixed');
    await showViewer(page, 1);
    const sheets = page.locator(SHEETS);
    const total = await sheets.count();
    const drawn = page.locator(`${SHEETS}[data-drawn]`);
    await expect(sheets.last()).not.toHaveAttribute('data-drawn');
    const near = await drawn.count();
    expect(near).toBeLessThan(total);
    // The print events, as a print from the browser's menu fires them.
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await expect(drawn).toHaveCount(total);
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await expect(drawn).toHaveCount(near);
    // The print media alone, as a print emulated without the events gives it.
    await page.emulateMedia({ media: 'print' });
    await expect(drawn).toHaveCount(total);
    const lastText = await sheets.last().locator('.pm-page-content').innerText();
    expect(lastText.trim()).not.toBe('');
    await page.emulateMedia({ media: 'screen' });
    await expect(drawn).toHaveCount(near);
  });

  // A late page's first caption, drawn alone and with every page before it drawn: the engine's number.
  // The page is the last that holds a figure caption, found with every page drawn, so a change that
  // moves the document's pages does not move the test off its caption.
  for (const name of ['caption-numbering', 'long-mixed'] as const) {
    test(`DOCE-PAGINATION-13.7 numbers the last captioned page of ${name} drawn alone as the engine laid it out`, async ({
      page,
    }) => {
      await open(page, name);
      await showViewer(page);
      const index = await page
        .locator(SHEETS)
        .evaluateAll((sheets) =>
          sheets.findLastIndex((sheet) => sheet.querySelector('figcaption')),
        );
      expect(index).toBeGreaterThan(2);
      const caption = page.locator(SHEETS).nth(index).locator('figcaption').first();
      const shoot = async () => {
        await page.locator(SHEETS).nth(index).scrollIntoViewIfNeeded();
        await expect(page.locator(SHEETS).nth(index)).toHaveAttribute('data-drawn', 'true');
        return caption.screenshot();
      };
      await showViewer(page, 0);
      const alone = await shoot();
      await expect(page.locator(`${SHEETS}[data-drawn]`)).not.toHaveCount(
        await page.locator(SHEETS).count(),
      );
      // The page carries the caption's number the engine laid the pages out with.
      const number = await caption.evaluate((element: HTMLElement) =>
        element.style.getPropertyValue('--de-number'),
      );
      expect(number).toMatch(/\d/u);
      await showViewer(page);
      expect((await shoot()).equals(alone)).toBe(true);
    });
  }

  // The regression documents link only within a page, so the test adds a link on the first page to
  // a block of the last, as a reference to it draws one.
  // The page a block of the computed pages is on, by its element id.
  const pageOf = (pages: ReturnType<RegressionProbe['textLines']>, id: string) =>
    pages.findIndex((each) => each.blocks.some((block) => block.elementId === id));

  for (const rtl of [false, true]) {
    test(`DOCE-PAGINATION-13.9 follows a link to a ${rtl ? 'right-to-left paragraph on a ' : ''}page not drawn yet`, async ({
      page,
    }) => {
      await open(page, 'long-mixed');
      const computed = await page.evaluate(() => window.regressionLab.textLines());
      const last = computed
        .at(-1)
        ?.blocks.find(
          (block) => !block.region && block.elementId && (block.lines?.length ?? 0) > 0,
        );
      const target = last?.elementId ?? '';
      expect(target, 'a paragraph on the last page').not.toBe('');
      if (rtl) {
        // Its first strong letter becomes Hebrew: the paragraph turns right to left (9.12).
        const paragraph = page
          .locator(`.de-document-editor__content [data-id="${target}"]`)
          .first();
        await paragraph.evaluate((element) => element.scrollIntoView({ block: 'center' }));
        await expect(paragraph).toBeInViewport();
        await paragraph.click({ position: { x: 1, y: 4 } });
        await page.keyboard.type('שלום עולם ');
        await page.evaluate(async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return window.stressLab.whenSettled();
        });
      }
      const at = pageOf(await page.evaluate(() => window.regressionLab.textLines()), target);
      expect(at, 'the target on a late page').toBeGreaterThan(1);
      await showViewer(page, 0);
      const first = page.locator(SHEETS).first();
      await first.scrollIntoViewIfNeeded();
      await expect(first).toHaveAttribute('data-drawn', 'true');
      await expect(page.locator(SHEETS).nth(at)).not.toHaveAttribute('data-drawn');
      await first.evaluate((sheet, id) => {
        const link = sheet.ownerDocument.createElement('a');
        link.href = `#${id}`;
        link.textContent = 'To a late page';
        sheet.querySelector('.pm-page-content')?.prepend(link);
      }, target);
      await page.getByRole('link', { name: 'To a late page' }).click();
      await expect(page.locator(SHEETS).nth(at)).toHaveAttribute('data-drawn', 'true');
      const anchor = page.locator(`${VIEWER} [id="${target}"]`);
      await expect(anchor).toBeInViewport();
      if (rtl) await expect(anchor).toHaveAttribute('dir', 'rtl');
      expect(new URL(page.url()).hash).toBe('');
    });
  }

  test('DOCE-PAGINATION-13.9 leaves modified clicks to the browser, follows Enter and reads a literal percent', async ({
    page,
  }) => {
    const errors: Error[] = [];
    page.on('pageerror', (error) => errors.push(error));
    await open(page, 'long-mixed');
    const computed = await page.evaluate(() => window.regressionLab.textLines());
    const target = computed
      .at(-1)
      ?.blocks.find((block) => !block.region && block.elementId && (block.lines?.length ?? 0) > 0);
    const at = pageOf(computed, target?.elementId ?? '');
    expect(at, 'the target on a late page').toBeGreaterThan(1);
    await showViewer(page, 0);
    const first = page.locator(SHEETS).first();
    await first.scrollIntoViewIfNeeded();
    await expect(first).toHaveAttribute('data-drawn', 'true');
    await first.evaluate((sheet, id) => {
      const add = (href: string, text: string) => {
        const link = sheet.ownerDocument.createElement('a');
        link.setAttribute('href', href);
        link.textContent = text;
        sheet.querySelector('.pm-page-content')?.prepend(link);
      };
      add(`#${id}`, 'To a late page');
      add('#50%', 'Half');
      // What the browser was left to do with each click that reached the document: the test
      // cancels it there, so no tab opens and the address stays.
      const seen: boolean[] = [];
      Object.assign(window, { seenClicks: seen });
      sheet.ownerDocument.addEventListener('click', (event) => {
        seen.push(event.defaultPrevented);
        event.preventDefault();
      });
    }, target?.elementId ?? '');
    const link = page.getByRole('link', { name: 'To a late page' });
    const top = await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0);
    for (const modifier of ['Control', 'Meta', 'Shift', 'Alt'] as const)
      await link.click({ modifiers: [modifier] });
    await link.click({ button: 'middle' });
    expect(
      await page.evaluate(() => (window as unknown as { seenClicks: boolean[] }).seenClicks),
    ).toEqual([false, false, false, false]);
    await expect(page.locator(SHEETS).nth(at)).not.toHaveAttribute('data-drawn');
    expect(await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0)).toBe(top);
    await page.getByRole('link', { name: 'Half' }).click();
    await link.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator(SHEETS).nth(at)).toHaveAttribute('data-drawn', 'true');
    await expect(page.locator(`${VIEWER} [id="${target?.elementId ?? ''}"]`)).toBeInViewport();
    expect(errors).toEqual([]);
  });
});
