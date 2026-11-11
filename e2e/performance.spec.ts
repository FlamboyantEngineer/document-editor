import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { CDPSession, Page } from '@playwright/test';
import type { StressProbe } from '../labs/src/stress/stress-probe.js';
import type { PaginationStats } from '../src/pagination/index.js';
import { expect, type LabFixture, test, waitForLab } from './fixtures.js';

// The performance harness: the budgets' metrics (specs/LABS.md DOCE-LABS-2.3) measured on the
// scale lab, reported as a table and in `test-results/performance.json`. It records; it does not
// enforce the budgets yet. Run it with `npm run test:perf`, on the development machine for the time
// bars.

declare global {
  interface Window {
    stressLab: StressProbe;
  }
}

// The scale lab's documents, by their place in its size picker.
const SIZE = {
  pages5: 0,
  pages24: 1,
  pages40: 2,
  pages300: 3,
  single5000: 4,
  sections25: 5,
  remote1600: 6,
} as const;

interface Measurement {
  readonly bar: string;
  readonly metric: string;
  readonly value: number;
  readonly target: string;
}

const measurements: Measurement[] = [];

function report(measurement: Measurement) {
  measurements.push(measurement);
  test.info().annotations.push({
    type: measurement.metric,
    description: `${String(measurement.value)} (target ${measurement.target})`,
  });
}

const pages = (page: Page) => page.locator('.de-document-editor__content .pm-page');
const blocks = (page: Page) => page.locator('.de-document-editor__content .pm-page-content > p');

async function openScale(lab: LabFixture, page: Page, size: number) {
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

// Waits for the pages to settle after a change: a moment for the change to reach the editor, then
// its layout state.
const settle = (page: Page) =>
  page.evaluate(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return window.stressLab.whenSettled();
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
async function caretAtEnd(page: Page, index: number) {
  const block = blocks(page).nth(index);
  await block.scrollIntoViewIfNeeded();
  await block.click();
  await page.keyboard.press('End');
  await settle(page);
}

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const at = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
  return Math.round((sorted[Math.max(at, 0)] ?? 0) * 10) / 10;
}

// The time from each key's press to the frame after it was drawn, while typing.
async function keystrokeLatencies(page: Page, keys: number): Promise<number[]> {
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

test.describe.configure({ timeout: 300_000 });

// Adds this worker's measurements to the report; a test that fails starts a new worker.
test.afterAll(() => {
  const file = 'test-results/performance.json';
  mkdirSync('test-results', { recursive: true });
  const earlier = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Measurement[]) : [];
  const all = [...earlier, ...measurements];
  writeFileSync(file, `${JSON.stringify(all, null, 2)}\n`);
  console.table(all);
});

test.describe('performance', () => {
  test('DOCE-LABS-2.3 DOCE-LABS-2.4 lays out one section of 5000 blocks', async ({ lab, page }) => {
    await openScale(lab, page, SIZE.single5000);
    const count = await pages(page).count();
    const first = await page.evaluate(() => window.stressLab.firstSettledAt);
    report({ bar: 'Single section, 5000 blocks', metric: 'pages', value: count, target: '≥ 300' });
    report({
      bar: 'Single section, 5000 blocks',
      metric: 'first settled (ms)',
      value: Math.round(first ?? Number.NaN),
      target: 'recorded; set at P3 exit',
    });
    expect(count).toBeGreaterThan(0);
  });

  test('DOCE-LABS-2.3 DOCE-LABS-2.4 converges after an edit in the middle of 25 sections', async ({
    lab,
    page,
  }) => {
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
    const bar = 'Multi-section, 25 × 200 blocks';
    report({ bar, metric: 'layouts to converge', value: change.layouts, target: '≤ 4' });
    report({ bar, metric: 'template regions rendered', value: regions, target: '≤ 24' });
    report({
      bar,
      metric: 'sections reused per layout',
      value: Math.round((change.sectionsReused / Math.max(change.layouts, 1)) * 10) / 10,
      target: '≥ 23 of 25',
    });
    expect(change.layouts).toBeGreaterThan(0);
  });

  test('DOCE-LABS-2.3 DOCE-LABS-2.4 lays out a remote keystroke in 1600 blocks', async ({
    lab,
    page,
  }) => {
    await openScale(lab, page, SIZE.remote1600);
    const keystrokes: PaginationStats[] = [];
    for (let index = 0; index < 5; index += 1) {
      const before = await stats(page);
      await page.evaluate(() => window.stressLab.typeRemotely('x'));
      await settle(page);
      keystrokes.push(difference(await stats(page), before));
    }
    const worst = (key: keyof PaginationStats) => Math.max(...keystrokes.map((each) => each[key]));
    const bar = 'Remote keystroke, 1600 blocks';
    report({ bar, metric: 'sections relaid', value: worst('sectionsRelaid'), target: '≤ 1' });
    report({ bar, metric: 'blocks measured', value: worst('blocksMeasured'), target: '≤ 5' });
    expect(worst('layouts')).toBeGreaterThan(0);
  });

  test('DOCE-LABS-2.3 scrolls 5 and 40 pages by the wheel', async ({ lab, page }) => {
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
    const bar = 'Wheel scroll';
    report({ bar, metric: 'layouts per wheel, 5 pages', value: five, target: '≤ 3' });
    report({ bar, metric: 'layouts per wheel, 40 pages', value: forty, target: '≤ 3, no growth' });
    expect(perWheel).toHaveLength(2);
  });

  test('DOCE-LABS-2.3 restyles as few elements per keystroke on 40 pages as on 5', async ({
    lab,
    page,
  }) => {
    const perKey: number[] = [];
    for (const size of [SIZE.pages5, SIZE.pages40]) {
      await openScale(lab, page, size);
      await caretAtEnd(page, 2);
      const keys = 10;
      const elements = await recalculatedElements(page, async () => {
        await page.keyboard.type('y'.repeat(keys), { delay: 60 });
        await settle(page);
      });
      perKey.push(Math.round((elements / keys) * 10) / 10);
    }
    const [five = 0, forty = 0] = perKey;
    report({
      bar: 'Typing style scope',
      metric: 'restyled elements per key, growth 5 → 40 pages',
      value: Math.round((forty / Math.max(five, 1)) * 100) / 100,
      target: '≤ 3',
    });
    expect(perKey).toHaveLength(2);
  });

  test('DOCE-LABS-2.3 answers keystrokes on 40 and 300 pages', async ({ lab, page }) => {
    for (const [size, pagesShown, target] of [
      [SIZE.pages40, 40, '≤ 16'],
      [SIZE.pages300, 300, '≤ 32'],
    ] as const) {
      await openScale(lab, page, size);
      await caretAtEnd(page, 3);
      const latencies = await keystrokeLatencies(page, 30);
      report({
        bar: 'Keystroke latency',
        metric: `p95 input to paint, ${String(pagesShown)} pages (ms)`,
        value: percentile(latencies, 0.95),
        target,
      });
      expect(latencies.length).toBeGreaterThan(0);
    }
  });

  test('DOCE-LABS-2.3 settles 24 pages on load', async ({ lab, page }) => {
    const loads: number[] = [];
    for (let run = 0; run < 5; run += 1) {
      await openScale(lab, page, SIZE.pages24);
      loads.push(Math.round((await page.evaluate(() => window.stressLab.firstSettledAt)) ?? 0));
    }
    const bar = 'Load, 24 pages';
    report({
      bar,
      metric: 'whenSettled median (ms)',
      value: percentile(loads, 0.5),
      target: '≤ 6000',
    });
    report({
      bar,
      metric: 'whenSettled p95 (ms)',
      value: percentile(loads, 0.95),
      target: '≤ 12000',
    });
    expect(loads).toHaveLength(5);
  });
});
