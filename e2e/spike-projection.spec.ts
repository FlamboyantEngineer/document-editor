// The paged projection spike's browser checks (PG-40, P0-9): input and selection routed between a
// read-only paged projection and the canonical whole document. Check 6, exact position mapping on
// generated edits, is the property test in labs/src/spikes/projection-map.test.ts.

import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

interface CanonicalSelection {
  from: number;
  to: number;
  text: string;
  cells: number;
  before: string;
  after: string;
}

interface SpikeStats {
  layouts: number;
  layoutMs: number[];
  resyncs: number;
  outOfSync: number;
  refused: number;
}

const canonical = (page: Page) =>
  page.evaluate(() => {
    const probe = window.projectionSpike;
    if (!probe) throw new Error('no probe');
    return probe.canonicalSelection();
  }) as Promise<CanonicalSelection>;

const stats = (page: Page) =>
  page.evaluate(() => window.projectionSpike?.stats()) as Promise<SpikeStats>;

const layouts = async (page: Page) => (await stats(page)).layouts;

const SPLIT = '.lab-pages p[data-id="p2-0"]';

// Puts the DOM caret in a fragment of the split paragraph: at the start of its second part, or the
// end of its first, as a click there would.
async function caretAtBreak(page: Page, side: 'start' | 'end') {
  await page.evaluate(
    ({ selector, side: at }) => {
      const part = document.querySelector(
        `${selector}[data-split-part-index="${at === 'start' ? '1' : '0'}"]`,
      );
      const walker = document.createTreeWalker(part ?? document.body, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      if (at === 'end') {
        for (let next = node; next; next = walker.nextNode()) node = next;
      }
      if (!node) throw new Error('no text');
      (part?.closest('[contenteditable]') as HTMLElement | null)?.focus();
      document.getSelection()?.collapse(node, at === 'start' ? 0 : (node.textContent?.length ?? 0));
    },
    { selector: SPLIT, side },
  );
}

// The canonical text at the break: what the first part ends and the second starts with.
async function breakText(page: Page) {
  return page.evaluate((selector) => {
    const parts = [...document.querySelectorAll(selector)];
    return {
      end: parts[0]?.textContent?.slice(-8) ?? '',
      start: parts[1]?.textContent?.slice(0, 8) ?? '',
    };
  }, SPLIT);
}

// Lays the pages out now and checks they join into the canonical document, and that no edit was
// refused or had to lay the pages out at once.
async function expectInSync(page: Page) {
  await page.evaluate(() => window.projectionSpike?.editor?.layout());
  const { outOfSync, resyncs, refused } = await stats(page);
  expect({ outOfSync, resyncs, refused }).toEqual({ outOfSync: 0, resyncs: 0, refused: 0 });
}

const percentile = (values: readonly number[], at: number) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * at))] ?? 0;
};

test.describe('paged projection spike', () => {
  test('check 1: caret, arrows, selection, Backspace and Enter across a split paragraph', async ({
    lab,
    page,
  }) => {
    await lab.open('spike-projection');
    const { end, start } = await breakText(page);
    expect(end.endsWith(' ')).toBe(true);
    await caretAtBreak(page, 'start');
    await expect.poll(async () => (await canonical(page)).after.slice(0, 8)).toBe(start);
    const at = await canonical(page);
    expect(at.after.startsWith(start)).toBe(true);
    expect(at.before.endsWith(end)).toBe(true);

    // Both sides of the break are one canonical position, so each arrow moves the caret one
    // character there: none is lost on the break.
    await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => (await canonical(page)).from).toBe(at.from - 1);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await canonical(page)).from).toBe(at.from + 1);
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');
    await expect
      .poll(async () => (await canonical(page)).text)
      .toBe(`${end.slice(-2)}${start.slice(0, 1)}`);

    // Backspace at the start of the second part deletes the character before the break.
    await caretAtBreak(page, 'start');
    await expect.poll(async () => (await canonical(page)).from).toBe(at.from);
    await page.keyboard.press('Backspace');
    await expect.poll(async () => (await canonical(page)).from).toBe(at.from - 1);
    expect((await canonical(page)).before.endsWith(end.trimEnd())).toBe(true);
    expect((await canonical(page)).after.startsWith(start)).toBe(true);

    // Enter splits the canonical paragraph there; the pages follow.
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await canonical(page)).before).toBe('');
    expect((await canonical(page)).after.startsWith(start)).toBe(true);
    await page.keyboard.type('New ', { delay: 10 });
    await expect.poll(async () => (await canonical(page)).before).toBe('New ');
    await expect(page.locator('.lab-pages').getByText(`New ${start}`)).toBeVisible();
    await expectInSync(page);
  });

  test('check 2: cell selection and column resize across a split table', async ({ lab, page }) => {
    // Tall enough that both parts of the table, on facing pages, are in view.
    await page.setViewportSize({ width: 1280, height: 1400 });
    await lab.open('spike-projection');
    const parts = page.locator('.lab-pages table[data-id="t-0"]');
    await parts.nth(0).locator('td').first().scrollIntoViewIfNeeded();
    expect(await parts.count()).toBeGreaterThanOrEqual(2);
    const first = parts.nth(0).locator('td').first();
    const second = parts.nth(1).locator('td').nth(2);
    const from = await first.boundingBox();
    const to = await second.boundingBox();
    if (!from || !to) throw new Error('no cells');
    await page.mouse.move(from.x + 10, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + 20, from.y + from.height / 2 + 30, { steps: 4 });
    await page.mouse.move(to.x + 10, to.y + to.height / 2, { steps: 8 });
    await page.mouse.up();
    const selection = await canonical(page);
    const firstRows = await parts.nth(0).locator('tr').count();
    // From the first part's first body row to the second part's second body row, one column.
    expect(selection.cells).toBe(firstRows - 1 + 2);
    await expect(parts.nth(0).locator('.selectedCell')).toHaveCount(firstRows - 1);
    await expect(parts.nth(1).locator('.selectedCell')).toHaveCount(2);

    // Dragging the column's border on the second part resizes the column on every part.
    const cell = await parts.nth(1).locator('td').nth(2).boundingBox();
    if (!cell) throw new Error('no cell');
    const edge = cell.x + cell.width - 1;
    await page.mouse.move(edge - 10, cell.y + cell.height / 2);
    await page.mouse.move(edge, cell.y + cell.height / 2, { steps: 4 });
    await expect(parts.nth(1).locator('.column-resize-handle').first()).toBeAttached();
    await page.mouse.down();
    await page.mouse.move(edge - 80, cell.y + cell.height / 2, { steps: 6 });
    await page.mouse.up();
    await expect
      .poll(() => page.evaluate(() => window.projectionSpike?.columnWidths('t-0')))
      .toEqual(expect.arrayContaining([expect.any(Array)]));
    const widths = (await page.evaluate(() => window.projectionSpike?.columnWidths('t-0'))) ?? [];
    const firstColumn = widths.filter((_, index) => index % 2 === 0);
    expect(new Set(firstColumn.map((width) => JSON.stringify(width))).size).toBe(1);
    expect(firstColumn[0]?.[0]).toBeGreaterThan(0);
    for (const index of [0, 1]) {
      await expect(parts.nth(index).locator('td[data-colwidth]').first()).toBeAttached();
    }
    await expectInSync(page);
  });

  test('check 3: IME composition and spellcheck at a page break', async ({ lab, page }) => {
    await lab.open('spike-projection');
    // A spellcheck replacement changes the DOM text directly, as the browser does.
    await page.evaluate((selector) => {
      const part = document.querySelector(`${selector}[data-split-part-index="1"]`);
      const walker = document.createTreeWalker(part ?? document.body, NodeFilter.SHOW_TEXT);
      const node = walker.nextNode() as Text | null;
      const word = node?.data.match(/^\S+/)?.[0] ?? '';
      node?.replaceData(0, word.length, 'Recovered');
    }, SPLIT);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const editor = window.projectionSpike?.editor;
          return editor?.canonical.doc.textContent.split('Recovered every room').length;
        }),
      )
      .toBe(2);
    await expectInSync(page);
    const { start } = await breakText(page);
    const cdp = await page.context().newCDPSession(page);
    const compose = async (steps: string[], committed: string) => {
      for (const step of steps) {
        await cdp.send('Input.imeSetComposition', {
          text: step,
          selectionStart: step.length,
          selectionEnd: step.length,
        });
      }
      await cdp.send('Input.insertText', { text: committed });
    };

    // At the start of the second part.
    await caretAtBreak(page, 'start');
    await compose(['k', 'か'], 'か');
    await expect.poll(async () => (await canonical(page)).after).toMatch(new RegExp(`^${start}`));
    await expect.poll(async () => (await canonical(page)).before).toMatch(/か$/);
    await expect(page.locator('.lab-pages').getByText('か')).toHaveCount(1);

    // At the end of the first part, while the pages are due to be laid out again.
    await caretAtBreak(page, 'end');
    await compose(['n', 'に'], 'に');
    await expect.poll(async () => (await canonical(page)).before).toMatch(/ に$/);
    await expect(page.locator('.lab-pages').getByText('に')).toHaveCount(1);

    await expectInSync(page);
    const text = await page.evaluate(
      () => window.projectionSpike?.editor?.canonical.doc.textContent,
    );
    expect(text?.split('か').length).toBe(2);
    expect(text?.split('に').length).toBe(2);
  });

  test('check 4: undo across a repagination', async ({ lab, page }) => {
    await lab.open('spike-projection');
    const pages = await page.evaluate(() => window.projectionSpike?.pages());
    await caretAtBreak(page, 'start');
    const added = ' More notes were taken here, and kept with the others.'.repeat(8);
    const before = await layouts(page);
    await page.keyboard.type(added, { delay: 0 });
    await expect.poll(() => layouts(page)).toBeGreaterThan(before);
    await expect(page.locator('.lab-pages').getByText(added.trim().slice(0, 40))).toBeVisible();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.locator('.lab-pages').getByText(added.trim().slice(0, 40))).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.projectionSpike?.pages())).toBe(pages);
    await page.keyboard.press('ControlOrMeta+y');
    await expect(page.locator('.lab-pages').getByText(added.trim().slice(0, 40))).toBeVisible();
    await expectInSync(page);
  });

  test('check 5: typing p95 at 300 pages', async ({ lab, page }) => {
    test.setTimeout(180_000);
    // Laying 300 pages out the first time takes longer than the fixture waits.
    await page.goto('spike-projection.html?copies=60');
    await expect(page.locator('html')).toHaveAttribute('data-lab-ready', 'true', {
      timeout: 120_000,
    });
    void lab;
    const pages = await page.evaluate(() => window.projectionSpike?.pages() ?? 0);
    expect(pages).toBeGreaterThanOrEqual(300);
    await page.locator('.lab-pages p[data-id="p2-30"]').first().scrollIntoViewIfNeeded();
    await page
      .locator('.lab-pages p[data-id="p2-30"]')
      .first()
      .click({ position: { x: 4, y: 8 } });
    await page.evaluate(() => window.projectionSpike?.latencies.splice(0));
    await page.keyboard.type('the quick brown fox jumps over the lazy dog '.repeat(4), {
      delay: 60,
    });
    await expect.poll(async () => (await stats(page)).layouts).toBeGreaterThan(1);
    const latencies = (await page.evaluate(() => window.projectionSpike?.latencies)) ?? [];
    const { layoutMs } = await stats(page);
    const report = {
      pages,
      keys: latencies.length,
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      layoutP50: percentile(layoutMs.slice(1), 0.5),
      layoutMax: Math.max(...layoutMs.slice(1)),
    };
    test.info().annotations.push({ type: 'typing', description: JSON.stringify(report) });
    console.log(JSON.stringify(report));
    expect(report.p95).toBeLessThanOrEqual(32);
  });
});
