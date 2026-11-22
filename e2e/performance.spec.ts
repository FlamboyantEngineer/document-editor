import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import {
  type Budget,
  BUDGETS,
  caretAtEnd,
  keystrokeLatencies,
  keystrokeWork,
  measureRemoteKeystrokes,
  measureSectionsEdit,
  measureStyleScope,
  measureSuggestionSteps,
  measureWheel,
  openScale,
  pages,
  percentile,
  remoteKeystrokeLatencies,
  SIZE,
  workloadLoads,
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

  test('DOCE-LABS-2.3 DOCE-COMMENTS-2.21 lays out a suggestion, its thread link and its decision in 1600 blocks', async ({
    lab,
    page,
  }) => {
    const { sectionsRelaid, blocksMeasured } = await measureSuggestionSteps(lab, page);
    report(BUDGETS.suggestSectionsRelaid, sectionsRelaid);
    report(BUDGETS.suggestBlocksMeasured, blocksMeasured);
  });

  test('DOCE-LABS-2.3 scrolls 5 and 40 pages by the wheel', async ({ lab, page }) => {
    const { five, forty, runs } = await measureWheel(lab, page);
    report(BUDGETS.wheel5, five);
    report(BUDGETS.wheel40, forty);
    for (const run of runs) {
      test.info().annotations.push({
        type: 'wheel',
        description: `${String(run.pagesBefore)} pages: ${run.restylesPerWheel.toFixed(2)} style recalculations per wheel`,
      });
    }
    expect(five).toBeGreaterThanOrEqual(0);
  });

  test('DOCE-LABS-2.3 restyles as few elements per keystroke on 40 pages as on 5', async ({
    lab,
    page,
  }) => {
    const { keys, enter } = await measureStyleScope(lab, page);
    report(BUDGETS.styleScope, keys);
    report(BUDGETS.styleScopeEnter, enter);
    expect(keys).toBeGreaterThan(0);
  });

  // The typing budgets are enforced, on each key's own work (`keystrokeWork`).
  async function typingWork(
    lab: Parameters<typeof openScale>[0],
    page: Page,
    size: number,
    options: { compare?: boolean; textLayout?: 'dom' | 'pretext' } = {},
  ) {
    await openScale(lab, page, size, options);
    await caretAtEnd(page, 3);
    return percentile(await keystrokeWork(page, 60), 0.95);
  }

  function expectMeets(budget: Budget, value: number) {
    report(budget, value);
    expect(budget.meets(value), `${budget.metric}: ${String(value)}, target ${budget.target}`).toBe(
      true,
    );
  }

  test('DOCE-LABS-2.3 answers each keystroke on 300 pages within its budget', async ({
    lab,
    page,
  }) => {
    expectMeets(BUDGETS.latency300, await typingWork(lab, page, SIZE.pages300));
  });

  test('DOCE-LABS-2.3 answers each keystroke on 40 pages within its budget', async ({
    lab,
    page,
  }) => {
    expectMeets(BUDGETS.latency40, await typingWork(lab, page, SIZE.pages40));
  });

  // With the layout engine (DOCE-PAGINATION-11.5), only the pages near the screen are drawn on its
  // lines and the others skip their layout, so the same budgets hold.
  test('DOCE-LABS-2.3 DOCE-PAGINATION-11.5 answers each keystroke on 300 pages within its budget with the layout engine', async ({
    lab,
    page,
  }) => {
    const options = { textLayout: 'pretext' } as const;
    expectMeets(BUDGETS.latency300, await typingWork(lab, page, SIZE.pages300, options));
  });

  // Known to be close: the p95 here is about 15.8 ms at the median on a cloud runner, since the
  // pages within half a screen below the frame are drawn on forced lines too (DOCE-PAGINATION-11.6),
  // so a local run can miss by a millisecond. Drawing those pages' lines off the keystroke is owed
  // (item T1 of the layout engine plan); the engine is not the default until this meets 16 ms.
  test('DOCE-LABS-2.3 DOCE-PAGINATION-11.5 answers each keystroke on 40 pages within its budget with the layout engine', async ({
    lab,
    page,
  }) => {
    const options = { textLayout: 'pretext' } as const;
    expectMeets(BUDGETS.latency40, await typingWork(lab, page, SIZE.pages40, options));
  });

  test('DOCE-LABS-2.3 draws each remote keystroke on 300 pages within its budget', async ({
    lab,
    page,
  }) => {
    await openScale(lab, page, SIZE.pages300);
    expectMeets(
      BUDGETS.latencyRemote300,
      percentile(await remoteKeystrokeLatencies(page, 60), 0.95),
    );
  });

  test('DOCE-LABS-2.3 DOCE-VERSIONS-2.5 types on 300 pages within its budget while changes show', async ({
    lab,
    page,
  }) => {
    // Typing compares only the block typed in; its work is reported beside plain typing's budget.
    const typing = await typingWork(lab, page, SIZE.pages300, { compare: true });
    report(BUDGETS.latencyCompare300, typing);
    expect(typing).toBeGreaterThan(0);
    // A remote change compares the whole document, at once, within the remote typing budget.
    await openScale(lab, page, SIZE.pages300, { compare: true });
    expectMeets(
      BUDGETS.latencyRemoteCompare300,
      percentile(await remoteKeystrokeLatencies(page, 60), 0.95),
    );
  });

  test('DOCE-LABS-2.3 answers keystrokes beside 500 threads', async ({ lab, page }) => {
    await openScale(lab, page, SIZE.review300);
    await caretAtEnd(page, 3);
    const latencies = await keystrokeLatencies(page, 30);
    report(BUDGETS.latencyReview300, percentile(latencies, 0.95));
    expect(latencies.length).toBeGreaterThan(0);
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

  test('DOCE-LABS-2.3 loads the 18- and 40-page workloads, cold and reloaded', async ({
    lab,
    page,
  }) => {
    const small = await workloadLoads(lab, page, SIZE.pages18);
    report(BUDGETS.loadCold18, percentile(small.cold, 0.5));
    report(BUDGETS.loadReload18, percentile(small.reload, 0.5));
    const large = await workloadLoads(lab, page, SIZE.pages40);
    report(BUDGETS.loadCold40, percentile(large.cold, 0.5));
    report(BUDGETS.loadReload40, percentile(large.reload, 0.5));
    expect([...small.cold, ...small.reload, ...large.cold, ...large.reload]).toHaveLength(20);
  });
});
