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
  await expect(status).toContainText('no size for inline footnote_reference');
  await expect(status).toContainText('an indivisible block exceeds the page content height');
  await expect(
    page.getByRole('region', { name: 'Document pages' }).locator('[data-page]'),
  ).toHaveCount(0);
});

// The production projection, laid out by the prediction's rules with its paragraphs split at the
// lines its own measuring view drew, puts the same source ranges on every page.
const production = [
  { name: 'long', widths: [601.6875, 481.6875], pages: [300, 320] },
  { name: 'stress-fragments', widths: [601.6875, 601, 375.5], pages: [6, 6, 7] },
  { name: 'stress-text', widths: [601.6875, 480], pages: [300, 354] },
  { name: 'stress-distinct', widths: [601.6875], pages: [312] },
  { name: 'stress-lists', widths: [601.6875, 480, 375.5], pages: [110, 130, 174] },
  { name: 'stress-mixed', widths: [601.6875, 601, 480, 375.5], pages: [70, 70, 81, 97] },
] as const;

for (const { name, widths, pages } of production) {
  test(`DOCE-LABS-5.2 matches production source ranges on every page of the ${name} document`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto('/pretext-pagination.html?measure');
    for (const [at, width] of widths.entries()) {
      const result = await page.evaluate(
        ({ name, width }) => window.pretextPagination.compareProductionBoundaries(name, width),
        { name, width },
      );
      const where = `${name} at ${String(width)} px`;
      expect(result.firstDivergence, `first page that differs, ${where}`).toBeNull();
      expect(result.html, where).toHaveLength(pages[at] ?? 0);
      expect(result.predicted, where).toEqual(result.html);
    }
  });
}

// The oracle fills its pages with a packer of its own, so pages the prediction packs into a share
// of their room show as pages ended too soon, and pages packed past it as pages ended too late.
test('DOCE-LABS-5.2 finds pages the prediction filled short of or past their room', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto('/pretext-pagination.html?measure');
  for (const name of ['stress-fragments', 'stress-lists', 'stress-mixed'] as const) {
    const fair = await page.evaluate(
      (name) => window.pretextPagination.verify(name, undefined, undefined),
      name,
    );
    expect(fair.boundaryMismatches, name).toEqual([]);
    const short = await page.evaluate(
      (name) => window.pretextPagination.verify(name, undefined, undefined, { packedShare: 0.75 }),
      name,
    );
    expect(short.predictedPages, name).toBeGreaterThan(short.htmlPages);
    expect(short.htmlPages, name).toBe(fair.htmlPages);
    expect(short.firstDivergence, name).toMatchObject({ page: 1, ends: 'short' });
    expect(short.overflow, name).toEqual([]);
    const long = await page.evaluate(
      (name) => window.pretextPagination.verify(name, undefined, undefined, { packedShare: 1.1 }),
      name,
    );
    expect(long.predictedPages, name).toBeLessThan(long.htmlPages);
    expect(long.firstDivergence, name).toMatchObject({ ends: 'long' });
    expect(long.overflow.length, name).toBeGreaterThan(0);
  }
});
