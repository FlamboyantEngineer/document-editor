// Check 5 of the paged projection spike (PG-40, P0-9): typing latency at 300 pages. It measures the
// time from a key press to the next frame, so it runs in its own Playwright project after every
// other test, with no other worker sharing the machine (playwright.config.ts).

import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

interface SpikeStats {
  layouts: number;
  layoutMs: number[];
}

const stats = (page: Page) =>
  page.evaluate(() => window.projectionSpike?.stats()) as Promise<SpikeStats>;

const percentile = (values: readonly number[], at: number) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * at))] ?? 0;
};

test.describe('paged projection spike', () => {
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
