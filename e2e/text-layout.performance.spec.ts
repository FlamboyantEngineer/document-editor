import type { Page } from '@playwright/test';
import { caretAtEnd, keystrokeWork, openScale, percentile, SIZE } from './budgets.js';
import { expect, test } from './fixtures.js';

// The layout engine's budgets (specs/LABS.md DOCE-LABS-2.6): on about 300 pages, with
// `textLayout=pretext`, the first layout, an Enter, a long insert as a paste gives, a range deleted,
// and typing far down the document after a scroll, each the median of three rounds. The engine
// becomes the only text layout, so each budget is a time of its own, not one against the DOM's
// measuring. Three CI runs on 23 November 2026 read first settle 4,195 / 5,855 / 6,078 ms, Enter
// 99 / 118 / 131, paste 198 / 227 / 232, range delete 194 / 213 / 256 and far typing p95
// 18.1 / 19.9 / 21.8 ms; each budget keeps the slowest reading at or under 60% of it, so a slow
// runner still passes and a real slowdown fails.

// From the lab opened to its pages first settled.
const FIRST_SETTLE_MS = 11_000;
// From the key to the pages settled with its change laid out.
const ENTER_MS = 250;
const PASTE_MS = 400;
const RANGE_DELETE_MS = 450;
// Typing far down 300 pages answers each key within the 300-page typing budget (DOCE-LABS-2.3).
const FAR_TYPING_MS = 32;
const ROUNDS = 3;

// About 3,400 characters, the text of a pasted page.
const PASTED = Array.from(
  { length: 60 },
  (_, index) => `Pasted sentence ${String(index)} with a few more words to lay out.`,
).join(' ');

// The time from a key's press to the pages settled with its change laid out, in milliseconds: a
// layout after the key, then no layout pending.
async function settledAfter(page: Page, act: () => Promise<void>): Promise<number> {
  await page.evaluate(() => {
    const layouts = window.stressLab.layoutStats()?.layouts ?? 0;
    Object.assign(window, { editStart: { at: Number.NaN, layouts } });
    window.addEventListener(
      'keydown',
      (event) => {
        const start = (window as unknown as { editStart: { at: number } }).editStart;
        if (Number.isNaN(start.at)) start.at = event.timeStamp;
      },
      { capture: true, once: true },
    );
  });
  await act();
  return page.evaluate(async () => {
    const start = (window as unknown as { editStart: { at: number; layouts: number } }).editStart;
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    for (;;) {
      await frame();
      const layouts = window.stressLab.layoutStats()?.layouts ?? 0;
      if (layouts > start.layouts && (await window.stressLab.whenSettled()) === 'settled') break;
    }
    return Math.round(performance.now() - start.at);
  });
}

interface Round {
  readonly firstSettle: number;
  readonly farTyping: number;
  readonly enter: number;
  readonly paste: number;
  readonly rangeDelete: number;
}

// One round: the document opened, then each edit in turn.
async function round(lab: Parameters<typeof openScale>[0], page: Page): Promise<Round> {
  await openScale(lab, page, SIZE.pages300, { textLayout: 'pretext' });
  const firstSettle = Math.round(
    (await page.evaluate(() => window.stressLab.firstSettledAt)) ?? Number.NaN,
  );
  // Far down the document: the caret in a block on about the 270th page, scrolled to.
  const count = await page.locator('.de-document-editor__content .pm-page-content > p').count();
  await caretAtEnd(page, Math.floor(count * 0.9));
  const farTyping = percentile(await keystrokeWork(page, 40), 0.95);
  // Near the start, where an edit moves every page after it.
  await caretAtEnd(page, 3);
  const enter = await settledAfter(page, () => page.keyboard.press('Enter'));
  const paste = await settledAfter(page, async () => {
    // A key starts the clock; the insert follows it at once, as a paste's shortcut does.
    await page.keyboard.press('Shift');
    await page.keyboard.insertText(PASTED);
  });
  // Eight lines of it selected, then deleted.
  for (let line = 0; line < 8; line += 1) await page.keyboard.press('Shift+ArrowUp');
  const rangeDelete = await settledAfter(page, () => page.keyboard.press('Delete'));
  return { firstSettle, farTyping, enter, paste, rangeDelete };
}

const median = (rounds: readonly Round[], key: keyof Round) =>
  percentile(
    rounds.map((each) => each[key]),
    0.5,
  );

test('DOCE-LABS-2.6 DOCE-PAGINATION-11.5 lays out, edits and types on 300 pages with the layout engine within its budgets', async ({
  lab,
  page,
}) => {
  test.setTimeout(600_000);
  const rounds: Round[] = [];
  for (let index = 0; index < ROUNDS; index += 1) rounds.push(await round(lab, page));
  const keys = ['firstSettle', 'farTyping', 'enter', 'paste', 'rangeDelete'] as const;
  const result = Object.fromEntries(keys.map((key) => [key, median(rounds, key)]));
  for (const key of keys)
    test.info().annotations.push({
      type: key,
      description: `${String(result[key])} of ${rounds.map((each) => each[key]).join(', ')}`,
    });
  console.log(JSON.stringify(result));
  const within = (key: (typeof keys)[number], budget: number) =>
    expect(result[key] ?? Number.NaN, `${key} (ms)`).toBeLessThanOrEqual(budget);
  within('firstSettle', FIRST_SETTLE_MS);
  within('enter', ENTER_MS);
  within('paste', PASTE_MS);
  within('rangeDelete', RANGE_DELETE_MS);
  within('farTyping', FAR_TYPING_MS);
});
