import { expect, test } from './fixtures.js';

const workloads = [
  {
    name: 'stress-text',
    widths: [undefined, 600.984375, 601, 601.015625, 600, 480],
    boxes: 4420,
    minimumPages: 290,
  },
  { name: 'stress-distinct', widths: [undefined, 481.6875], boxes: 4420, minimumPages: 300 },
  { name: 'stress-lists', widths: [undefined, 601, 600, 480], boxes: 7683, minimumPages: 100 },
  { name: 'stress-fragments', widths: [undefined, 601, 375.5], boxes: 3, minimumPages: 6 },
  {
    name: 'stress-mixed',
    widths: [undefined, 601, 600, 480, 375.5],
    boxes: 1189,
    minimumPages: 60,
  },
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
      expect(result.comparedSplitLines).toBeGreaterThan(0);
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
  await page.getByRole('combobox', { name: 'View', exact: true }).selectOption('preview');
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

test('DOCE-LABS-5.2 matches production source ranges on every page before and after narrowing', async ({
  page,
}) => {
  await page.goto('/pretext-pagination.html?measure');
  for (const [width, pages] of [
    [601.6875, 300],
    [481.6875, 320],
  ] as const) {
    const { predicted, html } = await page.evaluate(
      (width) => window.pretextPagination.compareProductionBoundaries('long', width),
      width,
    );
    expect(html).toHaveLength(pages);
    expect(predicted).toHaveLength(pages);
    for (const [i, parts] of html.entries())
      expect(predicted?.[i], `Page ${String(i + 1)} at ${String(width)} px`).toEqual(parts);
  }
});
