import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  type Budget,
  BUDGETS,
  caretAtEnd,
  keystrokeLatencies,
  measureRemoteKeystrokes,
  measureSectionsEdit,
  measureStyleScope,
  measureWheel,
  openScale,
  pages,
  percentile,
  SIZE,
} from './budgets.js';
import { expect, test } from './fixtures.js';

// The performance harness: the budgets' metrics (specs/LABS.md DOCE-LABS-2.3) measured on the
// scale lab, reported beside their targets and whether they meet them, as a table and in
// `test-results/performance.json`. It records; it does not fail on a missed budget until the
// budgets are enforced at the end of the pagination phase. Run it with `npm run test:perf`, on the
// development machine for the time bars.

interface Measurement {
  readonly bar: string;
  readonly metric: string;
  readonly value: number;
  readonly target: string;
  readonly met: boolean;
}

const measurements: Measurement[] = [];

function report(budget: Budget, value: number) {
  const met = budget.meets(value);
  measurements.push({ bar: budget.bar, metric: budget.metric, value, target: budget.target, met });
  test.info().annotations.push({
    type: budget.metric,
    description: `${String(value)} (target ${budget.target}, ${met ? 'met' : 'missed'})`,
  });
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
    report(BUDGETS.pages5000, count);
    report(BUDGETS.firstSettled5000, Math.round(first ?? Number.NaN));
    expect(count).toBeGreaterThan(0);
  });

  test('DOCE-LABS-2.3 DOCE-LABS-2.4 converges after an edit in the middle of 25 sections', async ({
    lab,
    page,
  }) => {
    const { layouts, regions, sectionsReused } = await measureSectionsEdit(lab, page);
    report(BUDGETS.convergeLayouts, layouts);
    report(BUDGETS.regionsRendered, regions);
    report(BUDGETS.sectionsReused, sectionsReused);
    expect(layouts).toBeGreaterThan(0);
  });

  test('DOCE-LABS-2.3 DOCE-LABS-2.4 lays out a remote keystroke in 1600 blocks', async ({
    lab,
    page,
  }) => {
    const { layouts, sectionsRelaid, blocksMeasured } = await measureRemoteKeystrokes(lab, page);
    report(BUDGETS.remoteSectionsRelaid, sectionsRelaid);
    report(BUDGETS.remoteBlocksMeasured, blocksMeasured);
    expect(layouts).toBeGreaterThan(0);
  });

  test('DOCE-LABS-2.3 scrolls 5 and 40 pages by the wheel', async ({ lab, page }) => {
    const { five, forty } = await measureWheel(lab, page);
    report(BUDGETS.wheel5, five);
    report(BUDGETS.wheel40, forty);
    expect(five).toBeGreaterThanOrEqual(0);
  });

  test('DOCE-LABS-2.3 restyles as few elements per keystroke on 40 pages as on 5', async ({
    lab,
    page,
  }) => {
    const growth = await measureStyleScope(lab, page);
    report(BUDGETS.styleScope, growth);
    expect(growth).toBeGreaterThan(0);
  });

  test('DOCE-LABS-2.3 answers keystrokes on 40 and 300 pages, and beside 500 threads', async ({
    lab,
    page,
  }) => {
    for (const [size, budget] of [
      [SIZE.pages40, BUDGETS.latency40],
      [SIZE.pages300, BUDGETS.latency300],
      [SIZE.review300, BUDGETS.latencyReview300],
    ] as const) {
      await openScale(lab, page, size);
      await caretAtEnd(page, 3);
      const latencies = await keystrokeLatencies(page, 30);
      report(budget, percentile(latencies, 0.95));
      expect(latencies.length).toBeGreaterThan(0);
    }
  });

  test('DOCE-LABS-2.3 settles 24 pages on load', async ({ lab, page }) => {
    const loads: number[] = [];
    for (let run = 0; run < 5; run += 1) {
      await openScale(lab, page, SIZE.pages24);
      loads.push(Math.round((await page.evaluate(() => window.stressLab.firstSettledAt)) ?? 0));
    }
    report(BUDGETS.loadMedian, percentile(loads, 0.5));
    report(BUDGETS.loadP95, percentile(loads, 0.95));
    expect(loads).toHaveLength(5);
  });
});
