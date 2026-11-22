import type { CDPSession, Page } from '@playwright/test';
import type { StressProbe } from '../labs/src/stress/stress-probe.js';
import type { PaginationStats } from '../src/pagination/index.js';
import { expect, type LabFixture, waitForLab } from './fixtures.js';

// The performance budgets (specs/LABS.md DOCE-LABS-2.3) and how each is measured on the scale lab.
// `performance.spec.ts` reports every budget; `budget-counters.performance.spec.ts` holds the
// counter budgets, which do not depend on the machine, on every pull request.

declare global {
  interface Window {
    stressLab: StressProbe;
  }
}

/** A budget: the bar it belongs to, what it measures, its target and whether a value meets it. */
export interface Budget {
  readonly bar: string;
  readonly metric: string;
  readonly target: string;
  readonly meets: (value: number) => boolean;
}

const atMost = (limit: number) => (value: number) => value <= limit;
const atLeast = (limit: number) => (value: number) => value >= limit;
const recorded = () => true;

/** The budgets, by name. */
export const BUDGETS = {
  pages5000: {
    bar: 'Single section, 5000 blocks',
    metric: 'pages',
    target: '≥ 300',
    meets: atLeast(300),
  },
  firstSettled5000: {
    bar: 'Single section, 5000 blocks',
    metric: 'first settled (ms)',
    target: 'recorded; set at P3 exit',
    meets: recorded,
  },
  convergeLayouts: {
    bar: 'Multi-section, 25 × 200 blocks',
    metric: 'layouts to converge',
    target: '≤ 4',
    meets: atMost(4),
  },
  regionsRendered: {
    bar: 'Multi-section, 25 × 200 blocks',
    metric: 'template regions rendered',
    target: '≤ 24',
    meets: atMost(24),
  },
  sectionsReused: {
    bar: 'Multi-section, 25 × 200 blocks',
    metric: 'sections reused per layout',
    target: '≥ 23 of 25',
    meets: atLeast(23),
  },
  remoteSectionsRelaid: {
    bar: 'Remote keystroke, 1600 blocks',
    metric: 'sections relaid',
    target: '≤ 1',
    meets: atMost(1),
  },
  startupLayouts: {
    bar: 'Startup, 24 pages',
    metric: 'layouts to first settle',
    target: '≤ 2',
    meets: atMost(2),
  },
  startupRemeasured: {
    bar: 'Startup, 24 pages',
    metric: 'blocks measured beyond one each',
    target: '0',
    meets: atMost(0),
  },
  startupAfterSettle: {
    bar: 'Startup, 24 pages',
    metric: 'layouts in the second after settling',
    target: '0',
    meets: atMost(0),
  },
  remoteBlocksMeasured: {
    bar: 'Remote keystroke, 1600 blocks',
    metric: 'blocks measured',
    target: '≤ 5',
    meets: atMost(5),
  },
  suggestSectionsRelaid: {
    bar: 'Suggested keystroke, link and decision, 1600 blocks',
    metric: 'sections relaid',
    target: '≤ 1',
    meets: atMost(1),
  },
  suggestBlocksMeasured: {
    bar: 'Suggested keystroke, link and decision, 1600 blocks',
    metric: 'blocks measured',
    target: '≤ 5',
    meets: atMost(5),
  },
  wheel5: {
    bar: 'Wheel scroll',
    metric: 'layouts per wheel, 5 pages',
    target: '≤ 3',
    meets: atMost(3),
  },
  wheel40: {
    bar: 'Wheel scroll',
    metric: 'layouts per wheel, 40 pages',
    target: '≤ 3, no growth',
    meets: atMost(3),
  },
  pageReads5: {
    bar: 'Page in view',
    metric: 'page boxes read per wheel, 5 pages',
    target: '≤ 8',
    meets: atMost(8),
  },
  pageReads40: {
    bar: 'Page in view',
    metric: 'page boxes read per wheel, 40 pages',
    target: '≤ 12, no scan of every page',
    meets: atMost(12),
  },
  styleScope: {
    bar: 'Typing style scope',
    metric: 'restyled elements per key, growth 5 → 40 pages',
    target: '≤ 3',
    meets: atMost(3),
  },
  styleScopeEnter: {
    bar: 'Typing style scope',
    metric: 'restyled elements for an Enter, 40 pages',
    target: '≤ 800',
    meets: atMost(800),
  },
  latency40: {
    bar: 'Keystroke latency',
    metric: 'p95 keystroke work, 40 pages (ms)',
    target: '≤ 16',
    meets: atMost(16),
  },
  latency300: {
    bar: 'Keystroke latency',
    metric: 'p95 keystroke work, 300 pages (ms)',
    target: '≤ 32',
    meets: atMost(32),
  },
  latencyRemote300: {
    bar: 'Remote typing',
    metric: 'p95 remote keystroke to frame drawn, 300 pages (ms)',
    target: '≤ 32',
    meets: atMost(32),
  },
  latencyCompare300: {
    bar: 'Keystroke latency',
    metric: 'p95 keystroke work, 300 pages compared with the document as opened (ms)',
    target: '≤ 32',
    meets: atMost(32),
  },
  latencyRemoteCompare300: {
    bar: 'Remote typing',
    metric:
      'p95 remote keystroke to frame drawn, 300 pages compared with the document as opened (ms)',
    target: '≤ 32',
    meets: atMost(32),
  },
  latencyReview300: {
    bar: 'Keystroke latency',
    metric: 'p95 input to paint, 300 pages beside 500 comment threads (ms)',
    target: '≤ 32',
    meets: atMost(32),
  },
  loadMedian: {
    bar: 'Load, 24 pages',
    metric: 'whenSettled median (ms)',
    target: '≤ 6000',
    meets: atMost(6000),
  },
  loadP95: {
    bar: 'Load, 24 pages',
    metric: 'whenSettled p95 (ms)',
    target: '≤ 12000',
    meets: atMost(12000),
  },
  loadCold18: {
    bar: 'Workload load, 18 pages',
    metric: 'whenSettled median, cold cache (ms)',
    target: '≤ 2600',
    meets: atMost(2600),
  },
  loadReload18: {
    bar: 'Workload load, 18 pages',
    metric: 'whenSettled median, reload (ms)',
    target: '≤ 2200',
    meets: atMost(2200),
  },
  loadCold40: {
    bar: 'Workload load, 40 pages',
    metric: 'whenSettled median, cold cache (ms)',
    target: '≤ 4500',
    meets: atMost(4500),
  },
  loadReload40: {
    bar: 'Workload load, 40 pages',
    metric: 'whenSettled median, reload (ms)',
    target: '≤ 4000',
    meets: atMost(4000),
  },
} as const satisfies Record<string, Budget>;

// The scale lab's documents, by their place in its size picker.
export const SIZE = {
  pages5: 0,
  pages24: 1,
  pages40: 2,
  pages300: 3,
  single5000: 4,
  sections25: 5,
  remote1600: 6,
  review300: 7,
  pages18: 8,
  shortLists100: 9,
} as const;

export const pages = (page: Page) => page.locator('.de-document-editor__content .pm-page');
const blocks = (page: Page) => page.locator('.de-document-editor__content .pm-page-content > p');

export async function openScale(
  lab: LabFixture,
  page: Page,
  size: number,
  {
    compare = false,
    textLayout = 'dom',
  }: { compare?: boolean; textLayout?: 'dom' | 'pretext' } = {},
) {
  const query = `${compare ? '&compare' : ''}${textLayout === 'pretext' ? '&textLayout=pretext' : ''}`;
  await page.goto(`stress-scale.html?size=${String(size)}${query}`);
  // The largest documents take longer than the usual wait to settle.
  await expect(page.locator('html')).toHaveAttribute('data-lab-ready', 'true', {
    timeout: 120_000,
  });
  await waitForLab(page);
  expect(lab.errors).toEqual([]);
}

/**
 * The time each of five loads of a scale document took to settle, from navigation: with the
 * browser's cache cleared first (`cold`), or reloaded with it warm (`reload`).
 */
export async function workloadLoads(lab: LabFixture, page: Page, size: number) {
  const settledAt = () =>
    page.evaluate(() => Math.round(window.stressLab.firstSettledAt ?? Number.NaN));
  const cdp = await page.context().newCDPSession(page);
  const cold: number[] = [];
  const reload: number[] = [];
  for (let run = 0; run < 5; run += 1) {
    await cdp.send('Network.clearBrowserCache');
    await openScale(lab, page, size);
    cold.push(await settledAt());
  }
  for (let run = 0; run < 5; run += 1) {
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-lab-ready', 'true', {
      timeout: 120_000,
    });
    reload.push(await settledAt());
  }
  return { cold, reload };
}

const stats = (page: Page) =>
  page.evaluate(() => window.stressLab.layoutStats()) as Promise<PaginationStats>;

// Waits for the pages to settle after a change: a moment for the change to reach the editor, its
// layout state, then an idle moment and a frame for the chrome, which follows the document a render
// later (DOCE-EDITOR-1.7), to draw it.
const settle = (page: Page) =>
  page.evaluate(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    await window.stressLab.whenSettled();
    await new Promise((resolve) => requestIdleCallback(resolve, { timeout: 1000 }));
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });

function difference(after: PaginationStats, before: PaginationStats): PaginationStats {
  const keys = Object.keys(after) as (keyof PaginationStats)[];
  return Object.fromEntries(
    keys.map((key) => [key, after[key] - before[key]]),
  ) as unknown as PaginationStats;
}

async function browserMetrics(cdp: CDPSession): Promise<Record<string, number>> {
  const { metrics } = await cdp.send('Performance.getMetrics');
  return Object.fromEntries(metrics.map(({ name, value }) => [name, value]));
}

// The elements the browser recalculated styles for while an action ran, from a trace.
async function recalculatedElements(page: Page, action: () => Promise<void>): Promise<number> {
  const cdp = await page.context().newCDPSession(page);
  const events: { name: string; args?: { elementCount?: number } }[] = [];
  cdp.on('Tracing.dataCollected', ({ value }) => {
    events.push(...(value as unknown as typeof events));
  });
  await cdp.send('Tracing.start', {
    categories: 'devtools.timeline',
    transferMode: 'ReportEvents',
  });
  await action();
  const complete = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve));
  await cdp.send('Tracing.end');
  await complete;
  await cdp.detach();
  return events
    .filter((event) => event.name === 'UpdateLayoutTree')
    .reduce((sum, event) => sum + (event.args?.elementCount ?? 0), 0);
}

// Puts the caret at the end of a text block on the pages, scrolled into view.
export async function caretAtEnd(page: Page, index: number) {
  const block = blocks(page).nth(index);
  await block.scrollIntoViewIfNeeded();
  await block.click();
  await page.keyboard.press('End');
  await settle(page);
}

export function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const at = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
  return Math.round((sorted[Math.max(at, 0)] ?? 0) * 10) / 10;
}

/**
 * The work each key takes while typing, without the wait for the next frame: from its press until
 * its input has been handled, then from the start of the frame that draws it until that frame is
 * drawn. A key whose handling runs into that frame counts from its press to the frame drawn. A key
 * pressed while the page is still busy, as with the chrome following the key before, waits for it,
 * and the wait counts.
 */
export async function keystrokeWork(page: Page, keys: number): Promise<number[]> {
  await page.evaluate(() => {
    const works: number[] = [];
    Object.assign(window, { keyWorks: works });
    window.addEventListener(
      'keydown',
      (event) => {
        const pressed = event.timeStamp;
        let handled = Number.NaN;
        setTimeout(() => {
          handled = performance.now();
        }, 0);
        requestAnimationFrame(() => {
          // The frame's own timestamp is when it began, which may be before the key was handled.
          const frame = performance.now();
          setTimeout(() => {
            const drawn = performance.now();
            const apart = !Number.isNaN(handled) && handled <= frame;
            works.push(apart ? handled - pressed + (drawn - frame) : drawn - pressed);
          }, 0);
        });
      },
      { capture: true },
    );
  });
  await page.keyboard.type('x'.repeat(keys), { delay: 60 });
  await settle(page);
  return page.evaluate(() => (window as unknown as { keyWorks: number[] }).keyWorks);
}

// The time from each key's press to the frame after it was drawn, while typing.
export async function keystrokeLatencies(page: Page, keys: number): Promise<number[]> {
  await page.evaluate(() => {
    const latencies: number[] = [];
    Object.assign(window, { keyLatencies: latencies });
    window.addEventListener(
      'keydown',
      (event) => {
        const pressed = event.timeStamp;
        requestAnimationFrame(() => {
          setTimeout(() => latencies.push(performance.now() - pressed), 0);
        });
      },
      { capture: true },
    );
  });
  await page.keyboard.type('x'.repeat(keys), { delay: 60 });
  await settle(page);
  return page.evaluate(() => (window as unknown as { keyLatencies: number[] }).keyLatencies);
}

/**
 * The time each remote keystroke takes, from the change reaching the editor until the frame after
 * it is drawn: one every 100 ms into the middle of the document, as a remote writer types. Remote
 * changes repaint at once, with no fixed tick (DOCE-COLLAB-4.1).
 */
export async function remoteKeystrokeLatencies(page: Page, keys: number): Promise<number[]> {
  const latencies = await page.evaluate(async (count) => {
    const found: number[] = [];
    for (let index = 0; index < count; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const arrived = performance.now();
      window.stressLab.typeRemotely('x');
      await new Promise((resolve) => {
        requestAnimationFrame(() => setTimeout(resolve, 0));
      });
      found.push(performance.now() - arrived);
    }
    return found;
  }, keys);
  await settle(page);
  return latencies;
}

/** Enter in the middle of 25 sections of 200 blocks: layouts, regions drawn, sections reused. */
export async function measureSectionsEdit(lab: LabFixture, page: Page) {
  await openScale(lab, page, SIZE.sections25);
  await caretAtEnd(page, Math.floor((await blocks(page).count()) / 2));
  await page.evaluate(() => {
    const regions = document.querySelectorAll(
      '.de-document-editor__content :is(.pm-page-header, .pm-page-footer)',
    );
    const rendered = new Set<Element>();
    Object.assign(window, { renderedRegions: rendered });
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        const region = (record.target as Element).closest?.('.pm-page-header, .pm-page-footer');
        if (region) rendered.add(region);
      }
    });
    for (const region of regions) {
      observer.observe(region, { subtree: true, childList: true, characterData: true });
    }
  });
  const before = await stats(page);
  await page.keyboard.press('Enter');
  await settle(page);
  const change = difference(await stats(page), before);
  const regions = await page.evaluate(
    () => (window as unknown as { renderedRegions: Set<Element> }).renderedRegions.size,
  );
  return {
    layouts: change.layouts,
    regions,
    sectionsReused: Math.round((change.sectionsReused / Math.max(change.layouts, 1)) * 10) / 10,
  };
}

/**
 * The 24-page document's startup: its layouts and blocks measured when it first settles, against
 * its blocks, and the layouts in the second after, which a pass that only renumbers would add.
 */
export async function measureStartup(lab: LabFixture, page: Page) {
  await openScale(lab, page, SIZE.pages24);
  const atReady = await stats(page);
  const blocks = await page
    .locator(
      '.de-document-editor__content .pm-page-content > :is(:not([data-split-part-index]), [data-split-part-index="0"])',
    )
    .count();
  await page.waitForTimeout(1000);
  const settled = await stats(page);
  return {
    layouts: atReady.layouts,
    remeasured: Math.max(0, atReady.blocksMeasured - blocks),
    afterSettle: settled.layouts - atReady.layouts,
  };
}

/**
 * Remote keystrokes in 1600 blocks, five times over: one inside a line, which keeps its block's
 * height and needs no layout, and one that starts a new line, which grows it and lays the pages out.
 * The most layouts a keystroke inside a line caused, how many line-starting keystrokes laid nothing
 * out, and the most layouts, sections relaid and blocks measured by one that did.
 */
export async function measureRemoteKeystrokes(lab: LabFixture, page: Page) {
  await openScale(lab, page, SIZE.remote1600);
  const keystroke = async () => {
    const before = await stats(page);
    await page.evaluate(() => window.stressLab.typeRemotely('x'));
    await settle(page);
    return difference(await stats(page), before);
  };
  const inLine: PaginationStats[] = [];
  const newLine: PaginationStats[] = [];
  for (let index = 0; index < 5; index += 1) {
    inLine.push(await keystroke());
    await page.evaluate(() => window.stressLab.typeRemotelyToLineEnd());
    await settle(page);
    newLine.push(await keystroke());
  }
  const worst = (key: keyof PaginationStats) => Math.max(...newLine.map((each) => each[key]));
  return {
    inLineLayouts: Math.max(...inLine.map((each) => each.layouts)),
    newLineMissed: newLine.filter((each) => each.layouts === 0).length,
    layouts: worst('layouts'),
    sectionsRelaid: worst('sectionsRelaid'),
    blocksMeasured: worst('blocksMeasured'),
  };
}

/**
 * A remote writer's suggestion in 1600 blocks, five times over: a suggested keystroke inside a
 * line, its thread named on it, and its acceptance, none of which changes a block's height. The
 * most layouts, sections relaid and blocks measured by any one of them.
 */
export async function measureSuggestionSteps(lab: LabFixture, page: Page) {
  await openScale(lab, page, SIZE.remote1600);
  const step = async (run: () => void) => {
    const before = await stats(page);
    await page.evaluate(run);
    await settle(page);
    return difference(await stats(page), before);
  };
  const suggested = page.locator('.de-document-editor__content ins');
  const steps: PaginationStats[] = [];
  for (let index = 0; index < 5; index += 1) {
    steps.push(await step(() => window.stressLab.suggestRemotely('x')));
    await expect(suggested).toHaveCount(1);
    steps.push(await step(() => window.stressLab.linkSuggestions()));
    steps.push(await step(() => window.stressLab.acceptSuggestions()));
    await expect(suggested).toHaveCount(0);
  }
  const worst = (key: keyof PaginationStats) => Math.max(...steps.map((each) => each[key]));
  return {
    layouts: worst('layouts'),
    sectionsRelaid: worst('sectionsRelaid'),
    blocksMeasured: worst('blocksMeasured'),
  };
}

/** What 20 wheel steps did on one document: its pages before and after, and the browser's work. */
export interface WheelRun {
  readonly pagesBefore: number;
  readonly pagesAfter: number;
  readonly layoutsPerWheel: number;
  readonly restylesPerWheel: number;
  /** How many times per wheel event the editor read a page's box to tell which pages are in view. */
  readonly pageReadsPerWheel: number;
}

// Counts the reads of a page's box from now on, in the page's own window.
async function countPageReads(page: Page) {
  await page.evaluate(() => {
    const counted = window as unknown as { pageReads?: number };
    counted.pageReads = 0;
    const read = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this.classList.contains('pm-page')) counted.pageReads = (counted.pageReads ?? 0) + 1;
      return read.call(this);
    };
  });
  return () => page.evaluate(() => (window as unknown as { pageReads?: number }).pageReads ?? 0);
}

/** The browser's layouts per wheel event on 5 and 40 pages, and what each run did. */
export async function measureWheel(lab: LabFixture, page: Page) {
  const runs: WheelRun[] = [];
  const pages = () => page.locator('.de-document-editor__content .pm-page').count();
  for (const size of [SIZE.pages5, SIZE.pages40]) {
    await openScale(lab, page, size);
    const pagesBefore = await pages();
    const viewport = page.locator('.de-document-editor__viewport');
    const box = await viewport.boundingBox();
    await page.mouse.move((box?.x ?? 0) + 200, (box?.y ?? 0) + 200);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const before = await browserMetrics(cdp);
    const pageReads = await countPageReads(page);
    const wheels = 20;
    for (let index = 0; index < wheels; index += 1) {
      await page.mouse.wheel(0, index < wheels / 2 ? 300 : -300);
      await page.waitForTimeout(50);
    }
    const after = await browserMetrics(cdp);
    await cdp.detach();
    const per = (key: string) => ((after[key] ?? 0) - (before[key] ?? 0)) / wheels;
    runs.push({
      pagesBefore,
      pagesAfter: await pages(),
      layoutsPerWheel: per('LayoutCount'),
      restylesPerWheel: per('RecalcStyleCount'),
      pageReadsPerWheel: (await pageReads()) / wheels,
    });
  }
  const [small, large] = runs;
  return { five: small?.layoutsPerWheel ?? 0, forty: large?.layoutsPerWheel ?? 0, runs };
}

/** How many times as many elements a keystroke restyles on 40 pages as on 5. */
export async function measureStyleScope(lab: LabFixture, page: Page) {
  const perKey: number[] = [];
  const perEnter: number[] = [];
  const heights: { before: number; after: number }[] = [];
  for (const size of [SIZE.pages5, SIZE.pages40]) {
    await openScale(lab, page, size);
    await caretAtEnd(page, 2);
    const keys = 10;
    // The keys typed put back the text deleted first, so the block keeps its height.
    for (let key = 0; key < keys; key += 1) await page.keyboard.press('Shift+ArrowLeft');
    const text = await page.evaluate(() => getSelection()?.toString() ?? '');
    await page.keyboard.press('Backspace');
    await settle(page);
    const height = () =>
      blocks(page)
        .nth(2)
        .evaluate((block) => block.getBoundingClientRect().height);
    const before = await height();
    const elements = await recalculatedElements(page, async () => {
      await page.keyboard.type(text, { delay: 60 });
      await settle(page);
    });
    heights.push({ before, after: await height() });
    perKey.push(elements / keys);
    // Enter starts a block, which moves the blocks after it from page to page: the structural cost
    // of a key, which grows with the pages after the caret (137 elements on 5 pages, 677 on 40).
    perEnter.push(
      await recalculatedElements(page, async () => {
        await page.keyboard.press('Enter');
        await settle(page);
      }),
    );
  }
  const growth = ([five = 0, forty = 0]: readonly number[]) =>
    Math.round((forty / Math.max(five, 1)) * 100) / 100;
  // `perKey` and `perEnter` are the raw counts, 5 pages then 40: a typed key restyles nothing at
  // either size today, so `keys` is 0 and only Enter's count shows the trace counts at all.
  return { keys: growth(perKey), enter: perEnter[1] ?? 0, perKey, perEnter, heights };
}
