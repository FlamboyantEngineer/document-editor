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
  remoteBlocksMeasured: {
    bar: 'Remote keystroke, 1600 blocks',
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
  styleScope: {
    bar: 'Typing style scope',
    metric: 'restyled elements per key, growth 5 → 40 pages',
    target: '≤ 3',
    meets: atMost(3),
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
} as const;

export const pages = (page: Page) => page.locator('.de-document-editor__content .pm-page');
const blocks = (page: Page) => page.locator('.de-document-editor__content .pm-page-content > p');

export async function openScale(lab: LabFixture, page: Page, size: number) {
  await page.goto(`stress-scale.html?size=${String(size)}`);
  // The largest documents take longer than the usual wait to settle.
  await expect(page.locator('html')).toHaveAttribute('data-lab-ready', 'true', {
    timeout: 120_000,
  });
  await waitForLab(page);
  expect(lab.errors).toEqual([]);
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

/** Five remote keystrokes in 1600 blocks: the most sections relaid and blocks measured by one. */
export async function measureRemoteKeystrokes(lab: LabFixture, page: Page) {
  await openScale(lab, page, SIZE.remote1600);
  const keystrokes: PaginationStats[] = [];
  for (let index = 0; index < 5; index += 1) {
    const before = await stats(page);
    await page.evaluate(() => window.stressLab.typeRemotely('x'));
    await settle(page);
    keystrokes.push(difference(await stats(page), before));
  }
  const worst = (key: keyof PaginationStats) => Math.max(...keystrokes.map((each) => each[key]));
  return {
    layouts: worst('layouts'),
    sectionsRelaid: worst('sectionsRelaid'),
    blocksMeasured: worst('blocksMeasured'),
  };
}

/** The browser's layouts per wheel event on 5 and 40 pages. */
export async function measureWheel(lab: LabFixture, page: Page) {
  const perWheel: number[] = [];
  for (const size of [SIZE.pages5, SIZE.pages40]) {
    await openScale(lab, page, size);
    const viewport = page.locator('.de-document-editor__viewport');
    const box = await viewport.boundingBox();
    await page.mouse.move((box?.x ?? 0) + 200, (box?.y ?? 0) + 200);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const before = await browserMetrics(cdp);
    const wheels = 20;
    for (let index = 0; index < wheels; index += 1) {
      await page.mouse.wheel(0, index < wheels / 2 ? 300 : -300);
      await page.waitForTimeout(50);
    }
    const after = await browserMetrics(cdp);
    await cdp.detach();
    perWheel.push(((after.LayoutCount ?? 0) - (before.LayoutCount ?? 0)) / wheels);
  }
  const [five = 0, forty = 0] = perWheel;
  return { five, forty };
}

/** How many times as many elements a keystroke restyles on 40 pages as on 5. */
export async function measureStyleScope(lab: LabFixture, page: Page) {
  const perKey: number[] = [];
  for (const size of [SIZE.pages5, SIZE.pages40]) {
    await openScale(lab, page, size);
    await caretAtEnd(page, 2);
    const keys = 10;
    const elements = await recalculatedElements(page, async () => {
      await page.keyboard.type('y'.repeat(keys), { delay: 60 });
      await settle(page);
    });
    perKey.push(elements / keys);
  }
  const [five = 0, forty = 0] = perKey;
  return Math.round((forty / Math.max(five, 1)) * 100) / 100;
}
