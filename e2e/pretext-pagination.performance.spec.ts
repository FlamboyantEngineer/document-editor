import { expect, test } from './fixtures.js';

test('DOCE-LABS-5.3 measures complete cold and width-change pagination costs', async ({
  page,
}, info) => {
  test.skip(
    !process.env.PRETEXT_BENCH,
    'Opt in to the repeated spike benchmark with PRETEXT_BENCH=1',
  );
  test.setTimeout(120_000);
  await page.goto('/pretext-pagination.html?measure');
  const results = [];
  for (const workload of ['short', 'medium', 'long'] as const) {
    for (let sample = 0; sample < 5; sample += 1) {
      const result = await page.evaluate(
        ({ workload, sample }) => window.pretextPagination.compare(workload, sample % 2 === 1),
        { workload, sample },
      );
      expect(result.predicted.warm.misses).toBe(result.predicted.cold.misses);
      expect(result.baseline.cold.totalPages).toBe(result.baseline.cold.mountedPages);
      expect(result.predicted.cold.mountedPages).toBeLessThanOrEqual(3);
      if (workload === 'long') {
        expect(result.baseline.cold.totalPages).toBeGreaterThanOrEqual(290);
        expect(result.predicted.cold.totalPages).toBeLessThanOrEqual(310);
      }
      results.push({ workload, sample, ...result });
    }
  }
  await info.attach('Pretext pagination measurements', {
    body: JSON.stringify({ browser: page.context().browser()?.version(), results }, null, 2),
    contentType: 'application/json',
  });
});
