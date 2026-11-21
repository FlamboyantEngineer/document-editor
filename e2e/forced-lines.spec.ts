import type { Page } from '@playwright/test';
import type { ForcedLinesReport } from '../labs/src/spikes/forced-lines/probe.js';
import { expect, test, waitForLab } from './fixtures.js';

// The forced-lines spike (labs/forced-lines.html): paragraphs and headings drawn on the lines
// Pretext computed inside the live editor. Every test ends by reading the drawn pages with the
// lab's guard: each block shows exactly the lines the plugin placed, and the browser wrapped none.

const content = (page: Page) => page.locator('.de-document-editor__content');
const paragraphs = (page: Page) => content(page).locator('.pm-page-content > p.fl-forced');

// The lines drawn as canonical decorations, and drawn on the pages' own view (`direct`).
const MODES = [
  { name: 'canonical decorations', query: '' },
  { name: 'the pages view', query: 'direct' },
] as const;
let mode = '';

async function open(page: Page, query = '') {
  await page.goto(`forced-lines.html?${[mode, query].filter(Boolean).join('&')}`);
  await waitForLab(page);
}

const check = (page: Page) => page.evaluate(() => window.forcedLines.check());

async function expectForced(page: Page): Promise<ForcedLinesReport> {
  const report = await check(page);
  expect(report.mismatches).toEqual([]);
  expect(report.blocks).toBeGreaterThan(0);
  return report;
}

const settle = (page: Page) => page.evaluate(() => window.stressLab.whenSettled());

// Where the caret is drawn: the top and left of the collapsed DOM selection, and its node's text.
function caret(page: Page) {
  return page.evaluate(() => {
    const selection = getSelection();
    const rect = selection?.getRangeAt(0).getClientRects()[0];
    return { top: Math.round(rect?.top ?? -1), left: Math.round(rect?.left ?? -1) };
  });
}

// The top of each line a paragraph draws.
function lineTops(page: Page, index: number) {
  return paragraphs(page)
    .nth(index)
    .evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const tops: number[] = [];
      for (const rect of range.getClientRects()) {
        const top = Math.round(rect.top);
        if (rect.height > 0 && !tops.includes(top)) tops.push(top);
      }
      return tops;
    });
}

for (const { name, query } of MODES) {
  test.describe(`Forced lines spike, drawn by ${name}`, () => {
    test.beforeEach(() => {
      mode = query;
    });

    for (const align of ['left', 'center', 'right', 'justify']) {
      test(`draws every block on its computed lines, aligned ${align}`, async ({ lab, page }) => {
        await open(page, `align=${align}`);
        const report = await expectForced(page);
        expect(report.lines).toBeGreaterThan(report.blocks);
        expect(lab.errors).toEqual([]);
      });
    }

    test('justified lines fill the column and centred lines sit in its middle', async ({
      page,
    }) => {
      for (const align of ['justify', 'center'] as const) {
        await open(page, `align=${align}`);
        const spans = await paragraphs(page)
          .first()
          .evaluate((element) => {
            const box = element.getBoundingClientRect();
            // Each line's first and last drawn character, spaces left out.
            const lines = new Map<number, { left: number; right: number }>();
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
            const range = document.createRange();
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
              const text = node.nodeValue ?? '';
              for (let at = 0; at < text.length; at += 1) {
                if (text[at] === ' ') continue;
                range.setStart(node, at);
                range.setEnd(node, at + 1);
                const rect = range.getBoundingClientRect();
                const top = Math.round(rect.top);
                const line = lines.get(top) ?? { left: Infinity, right: -Infinity };
                lines.set(top, {
                  left: Math.min(line.left, rect.left),
                  right: Math.max(line.right, rect.right),
                });
              }
            }
            // The column is the block's box less the slack the lab gives it.
            const right = box.right - 8;
            return [...lines.values()].map((line) => ({
              before: line.left - box.left,
              after: right - line.right,
            }));
          });
        const full = spans.slice(0, -1);
        expect(full.length).toBeGreaterThan(2);
        for (const line of full) {
          if (align === 'justify') expect(Math.abs(line.after)).toBeLessThan(1);
          else expect(Math.abs(line.before - line.after)).toBeLessThan(1);
        }
      }
    });

    test('a split paragraph keeps its forced lines on both pages', async ({ page }) => {
      await open(page);
      await expect(
        content(page).locator('p.fl-forced[data-split-part-index="1"]').first(),
      ).toBeAttached();
      await expectForced(page);
    });

    test('typing moves words between lines and the browser never wraps one', async ({ page }) => {
      await open(page);
      const first = paragraphs(page).first();
      await first.click({ position: { x: 40, y: 5 } });
      for (let round = 0; round < 6; round += 1) {
        await page.keyboard.type('more words here ');
        // Checked before the pages settle: the lines follow each key at once.
        await expectForced(page);
      }
      await page.keyboard.press('Enter');
      await page.keyboard.type('A new paragraph typed after Enter.');
      await settle(page);
      await expectForced(page);
    });

    test('Arrow Up and Down move one forced line and keep the column', async ({ page }) => {
      await open(page);
      const tops = await lineTops(page, 0);
      expect(tops.length).toBeGreaterThanOrEqual(5);
      const box = await paragraphs(page).first().boundingBox();
      await page.mouse.click((box?.x ?? 0) + 3, (tops[3] ?? 0) + 9);
      await expect.poll(async () => (await caret(page)).top).toBe(tops[3]);
      const start = await caret(page);
      for (const [key, line] of [
        ['ArrowUp', 2],
        ['ArrowUp', 1],
        ['ArrowUp', 0],
        ['ArrowDown', 1],
        ['ArrowDown', 2],
        ['ArrowDown', 3],
      ] as const) {
        await page.keyboard.press(key);
        // The editor reads the browser's move after the key; wait for it rather than racing it.
        await expect
          .poll(async () => (await caret(page)).top, { message: `${key} to line ${String(line)}` })
          .toBe(tops[line]);
        expect(Math.abs((await caret(page)).left - start.left)).toBeLessThan(8);
      }
    });

    test('Home and End stay on the forced line', async ({ page }) => {
      await open(page);
      const tops = await lineTops(page, 0);
      const box = await paragraphs(page).first().boundingBox();
      await page.mouse.click((box?.x ?? 0) + 60, (tops[1] ?? 0) + 9);
      await page.keyboard.press('End');
      const end = await caret(page);
      expect(end.top).toBe(tops[1]);
      expect(end.left).toBeGreaterThan((box?.x ?? 0) + (box?.width ?? 0) / 2);
      await page.keyboard.press('Home');
      expect(await caret(page)).toEqual({ top: tops[1], left: Math.round(box?.x ?? 0) });
      // Typing at the end of a line puts the text there.
      await page.keyboard.press('End');
      await page.keyboard.type('Q');
      await expect(paragraphs(page).first()).toContainText('Q');
      await expectForced(page);
    });

    test('double and triple clicks select a word and the whole paragraph', async ({ page }) => {
      await open(page);
      const tops = await lineTops(page, 0);
      const box = await paragraphs(page).first().boundingBox();
      await page.mouse.dblclick((box?.x ?? 0) + 20, (tops[1] ?? 0) + 9);
      expect(await page.evaluate(() => getSelection()?.toString())).toBe('each');
      await page.mouse.click((box?.x ?? 0) + 20, (tops[2] ?? 0) + 9, { clickCount: 3 });
      const selected = await page.evaluate(() => getSelection()?.toString() ?? '');
      const text = (await paragraphs(page).first().textContent()) ?? '';
      expect(selected.replace(/\s+/gu, ' ').trim()).toBe(text.replace(/\s+/gu, ' ').trim());
    });

    test('composition inserts its text and the lines follow', async ({ page }) => {
      await open(page);
      await paragraphs(page)
        .first()
        .click({ position: { x: 40, y: 5 } });
      const session = await page.context().newCDPSession(page);
      for (const text of ['ka', 'kan', 'かん']) {
        await session.send('Input.imeSetComposition', {
          text,
          selectionStart: text.length,
          selectionEnd: text.length,
        });
      }
      await session.send('Input.insertText', { text: '漢字' });
      await settle(page);
      await expect(paragraphs(page).first()).toContainText('漢字');
      await expectForced(page);
    });

    test('copying across a forced break copies the text without a line break', async ({
      page,
      context,
    }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await open(page);
      const tops = await lineTops(page, 0);
      const box = await paragraphs(page).first().boundingBox();
      const left = box?.x ?? 0;
      expect(tops.length).toBeGreaterThan(1);
      await page.mouse.click(left + 450, (tops[0] ?? 0) + 9);
      await page.keyboard.press('Shift+ArrowDown');
      await page.keyboard.press('ControlOrMeta+c');
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      expect(copied).not.toContain('\n');
      expect(copied.length).toBeGreaterThan(10);
      // Pasted into another paragraph, the text is laid out there.
      const target = paragraphs(page).filter({ hasText: 'This line ends in a space' });
      await target.click({ position: { x: 5, y: 5 } });
      await page.keyboard.press('Home');
      await page.keyboard.press('ControlOrMeta+v');
      await settle(page);
      await expect(target).toContainText(copied.trim());
      await expectForced(page);
    });

    test('find and proofing draw over the forced lines', async ({ page }) => {
      await open(page);
      await paragraphs(page)
        .first()
        .click({ position: { x: 40, y: 5 } });
      await page.keyboard.press('End');
      await page.keyboard.type(' teh ');
      await expect
        .poll(() => content(page).locator('[data-proofing-issue]').count(), { timeout: 15_000 })
        .toBeGreaterThan(0);
      await page.keyboard.press('ControlOrMeta+f');
      await page
        .getByRole('searchbox', { name: 'Find in document' })
        .or(page.getByRole('textbox', { name: 'Find in document' }))
        .fill('computed');
      await expect
        .poll(() => content(page).locator('[data-search-match]').count())
        .toBeGreaterThan(3);
      await settle(page);
      await expectForced(page);
    });

    test('suggested text is laid out on the forced lines', async ({ page }) => {
      await open(page, 'suggest');
      await paragraphs(page)
        .first()
        .click({ position: { x: 40, y: 5 } });
      await page.keyboard.type('suggested words go here ');
      await expect(content(page).locator('ins', { hasText: 'suggested' }).first()).toBeAttached();
      await page.keyboard.press('Backspace');
      await settle(page);
      await expectForced(page);
    });

    test('text in both directions is drawn and edited on its forced lines', async ({ page }) => {
      await open(page);
      const mixed = paragraphs(page).filter({ hasText: 'Mixed directions' });
      await mixed.getByText(/שלום/u).first().click();
      await page.keyboard.type('א');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('End');
      await page.keyboard.type(' more');
      await settle(page);
      await expect(mixed).toContainText('א');
      await expectForced(page);
    });
  });
}
