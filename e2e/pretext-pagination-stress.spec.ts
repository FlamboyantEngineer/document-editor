import { expect, test } from './fixtures.js';

const workloads = [
  { name: 'stress-text', widths: [undefined, 600, 480], boxes: 4420, minimumPages: 290 },
  { name: 'stress-lists', widths: [undefined, 600, 480], boxes: 7683, minimumPages: 100 },
  { name: 'stress-mixed', widths: [undefined, 600, 480, 375.5], boxes: 1189, minimumPages: 60 },
] as const;

for (const { name, widths, boxes, minimumPages } of workloads) {
  test(`DOCE-LABS-5.2 matches natural DOM dimensions across the ${name} document`, async ({
    page,
  }, info) => {
    test.setTimeout(120_000);
    await page.goto('/pretext-pagination.html?measure');
    const samples = [];
    for (const width of widths) {
      const result = await page.evaluate(
        ({ name, width }) => window.pretextPagination.verify(name, width),
        { name, width },
      );
      samples.push(result);
    }
    await info.attach('Stress HTML parity', {
      body: JSON.stringify(samples, null, 2),
      contentType: 'application/json',
    });
    expect(samples[0]?.width).toBe(601.6875);
    expect(samples[0]?.predictedPages).toBeGreaterThanOrEqual(minimumPages);
    for (const result of samples) {
      expect(result.sourceUnchanged).toBe(true);
      expect(result.comparedBlocks).toBe(boxes);
      expect(result.comparedPages).toBe(result.predictedPages);
      expect(result.htmlPages).toBe(result.predictedPages);
      expect(result.comparedFragments).toBeGreaterThan(result.predictedPages);
      expect(result.differences).toEqual([]);
      expect(result.boundaryMismatches).toEqual([]);
      expect(result.pageDifferences).toEqual([]);
      expect(result.overflow).toEqual([]);
    }
  });
}

test('DOCE-LABS-5.1 explains unsupported features in the full pagination stress document', async ({
  lab,
  page,
}) => {
  await lab.open('pretext-pagination');
  await page
    .getByRole('combobox', { name: 'Document', exact: true })
    .selectOption('stress-pagination');
  const status = page.locator('#pretext-status');
  await expect(status).toContainText('unsupported inline node footnote_reference');
  await expect(status).toContainText('an indivisible block exceeds the page content height');
  await expect(
    page.getByRole('region', { name: 'Document pages' }).locator('[data-page]'),
  ).toHaveCount(0);
});

test('DOCE-LABS-5.2 reports the mixed stress wrap discrepancy at the old rounded width', async ({
  page,
}, info) => {
  await page.goto('/pretext-pagination.html?measure');
  const result = await page.evaluate(() => window.pretextPagination.verify('stress-mixed', 601));
  await info.attach('Rounded-width parity', {
    body: JSON.stringify(result, null, 2),
    contentType: 'application/json',
  });
  expect(result.htmlPages).toBe(result.predictedPages);
  expect(result.pageDifferences).toEqual([]);
  expect(result.overflow).toEqual([]);
  for (const { path, metric } of result.differences) {
    expect({ path, metric }).toEqual({ path: '1', metric: 'line offsets' });
  }
  for (const page of result.boundaryMismatches) expect(page).toBeLessThanOrEqual(2);
});
