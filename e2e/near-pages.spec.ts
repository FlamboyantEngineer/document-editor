import type { Page } from '@playwright/test';
import type { RegressionProbe } from '../labs/src/regression/regression-probe.js';
import type { StressProbe } from '../labs/src/stress/stress-probe.js';
import { mismatchedLines } from './drawn-lines.js';
import { expect, test, waitForLab } from './fixtures.js';

// The pages near the screen while the reader scrolls (specs/LABS.md DOCE-LABS-8.12). By default only
// the pages within half a screen of the editor's scrolling frame, and the caret's page, are drawn on
// the engine's lines (DOCE-PAGINATION-11.6); the others keep the browser's. It is the one path where
// a page changes from the browser's lines to the engine's while the reader looks at it, so the test
// scrolls a long document down and up half a screen at a time and jumps to a far page, and after each
// move checks the pages near the screen draw the computed lines, every block keeps the place and
// height it had before it was forced, and the scroll position stays where it was put.

declare global {
  interface Window {
    regressionLab: RegressionProbe;
    stressLab: StressProbe;
  }
}

const settle = (page: Page) =>
  page.evaluate(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    await document.fonts.ready;
    return window.stressLab.whenSettled();
  });

/** What the pages show now: the frame that scrolls them, and each page's place and blocks. */
interface PagesState {
  readonly scrollTop: number;
  readonly maxScroll: number;
  readonly frameHeight: number;
  readonly pages: readonly {
    /** The page's top in the frame's content. */
    readonly top: number;
    readonly height: number;
    /** The forced blocks it draws, as `elementId#part`. */
    readonly forced: readonly string[];
    /** Each top-level block, as `elementId#part:top+height` from the page's top. */
    readonly blocks: readonly string[];
  }[];
}

// The frame is the nearest scrolling ancestor of the pages, as DOCE-PAGINATION-11.6 measures it.
const pagesState = (page: Page): Promise<PagesState> =>
  page.evaluate(() => {
    const sheets = [
      ...document.querySelectorAll<HTMLElement>(
        ':not(.de-document-viewer) > .de-document-editor__content .pm-page',
      ),
    ];
    let frame = sheets[0]?.parentElement ?? null;
    while (frame && !/auto|scroll/u.test(getComputedStyle(frame).overflowY))
      frame = frame.parentElement;
    if (!frame) throw new Error('no scrolling frame around the pages');
    const box = frame.getBoundingClientRect();
    const id = (element: HTMLElement) =>
      `${element.dataset.id ?? element.className}#${element.dataset.splitPartIndex ?? '0'}`;
    return {
      scrollTop: frame.scrollTop,
      maxScroll: frame.scrollHeight - frame.clientHeight,
      frameHeight: frame.clientHeight,
      pages: sheets.map((sheet) => {
        const at = sheet.getBoundingClientRect();
        return {
          top: at.top - box.top + frame.scrollTop,
          height: at.height,
          forced: [...sheet.querySelectorAll<HTMLElement>('.de-forced-lines')].map(id),
          blocks: [...sheet.querySelectorAll<HTMLElement>(':scope > .pm-page-content > *')].map(
            (block) => {
              const drawn = block.getBoundingClientRect();
              return `${id(block)}:${(drawn.top - at.top).toFixed(3)}+${drawn.height.toFixed(3)}`;
            },
          ),
        };
      }),
    };
  });

async function scrollTo(page: Page, top: number) {
  await page.evaluate((to) => {
    let frame = document.querySelector('.de-document-editor__content .pm-page')?.parentElement;
    while (frame && !/auto|scroll/u.test(getComputedStyle(frame).overflowY))
      frame = frame.parentElement;
    frame?.scrollTo({ top: to, behavior: 'instant' });
  }, top);
  await settle(page);
}

/**
 * The pages within half a screen of the frame, which shall be drawn on the engine's lines, and those
 * more than a pixel beyond, which shall keep the browser's. A page within a pixel of the edge may be
 * either.
 */
function pagesBy(state: PagesState): { near: number[]; far: number[] } {
  const reach = state.frameHeight / 2;
  const from = state.scrollTop - reach;
  const to = state.scrollTop + state.frameHeight + reach;
  const near: number[] = [];
  const far: number[] = [];
  state.pages.forEach(({ top, height }, index) => {
    if (top + height > from + 1 && top < to - 1) near.push(index);
    else if (top + height < from - 1 || top > to + 1) far.push(index);
  });
  return { near, far };
}

test.describe('DOCE-LABS-8.12 pages near the screen while scrolling', () => {
  test('DOCE-LABS-8.12 scrolling down and up and a jump to a far page draw each near page on its lines, move no block and keep the scroll position', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    // Only the pages near the screen are drawn on the engine's lines, as by default.
    await page.goto('regression.html?document=long-mixed&textLayout=pretext');
    await waitForLab(page);
    await settle(page);
    const first = await pagesState(page);
    expect(first.pages.length, 'pages of the long document').toBeGreaterThan(20);
    const computed = await page.evaluate(() => window.regressionLab.textLines());
    expect(computed.length, 'pages computed against pages drawn').toBe(first.pages.length);
    const forcedOf = computed.map(({ blocks }) =>
      blocks
        .filter((block) => block.lines !== null)
        .map((block) => `${block.elementId}#${String(block.part)}`),
    );
    // Far pages draw the browser's lines in the planned places, so the first state is the one every
    // block keeps once it is forced.
    const places = first.pages.map(({ top, blocks }) => ({ top, blocks }));

    const faults: string[] = [];
    const visit = async (at: number, move: string) => {
      await scrollTo(page, at);
      const state = await pagesState(page);
      const asked = Math.min(Math.max(at, 0), state.maxScroll);
      if (Math.abs(state.scrollTop - asked) > 1)
        faults.push(`${move}: scrolled to ${String(state.scrollTop)}, not ${String(asked)}`);
      const { near, far } = pagesBy(state);
      // The caret stays at the start of the document, so the first page is drawn as one near.
      for (const index of far.filter((each) => each > 0)) {
        if (state.pages[index]?.forced.length)
          faults.push(`${move}: page ${String(index)}, far from the screen, forces blocks`);
      }
      for (const index of near) {
        const forced = state.pages[index]?.forced ?? [];
        if (JSON.stringify(forced) !== JSON.stringify(forcedOf[index]))
          faults.push(
            `${move}: page ${String(index)} forces ${forced.join(' ')}, not ${forcedOf[index]?.join(' ') ?? ''}`,
          );
      }
      const lines = await mismatchedLines(
        page,
        computed.map((each, index) => (near.includes(index) ? each : { blocks: [] })),
      );
      for (const each of lines)
        faults.push(
          `${move}: page ${String(each.page)} block ${each.block} draws other lines than computed`,
        );
      state.pages.forEach(({ top, blocks }, index) => {
        const was = places[index];
        if (!was || Math.abs(was.top - top) > 0.5)
          faults.push(
            `${move}: page ${String(index)} moved from ${String(was?.top)} to ${String(top)}`,
          );
        blocks.forEach((block, at) => {
          if (block !== was?.blocks[at])
            faults.push(
              `${move}: page ${String(index)} block ${String(was?.blocks[at])} is now ${block}`,
            );
        });
      });
    };

    // Half a screen at a time, so each page that comes into view was near at the step before.
    const step = first.frameHeight / 2;
    const end = first.maxScroll;
    for (let at = step; at < end + step; at += step)
      await visit(Math.min(at, end), `down to ${String(Math.round(at))}`);
    for (let at = end - step; at > -step; at -= step)
      await visit(Math.max(at, 0), `up to ${String(Math.round(at))}`);
    const farPage = first.pages[Math.floor(first.pages.length * 0.7)];
    await visit(farPage?.top ?? 0, 'the jump to a far page');
    expect(faults, 'what changed when a page came near the screen').toEqual([]);
  });
});
