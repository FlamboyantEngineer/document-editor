import { expect, test } from './fixtures.js';

const url = '/pretext-pagination.html';
const largePage = 271;

test('DOCE-LABS-5.1 predicts off-document and keeps mounted pages bounded through a distant jump', async ({
  page,
}) => {
  await page.goto(`${url}?view=preview`);
  await expect(page.locator('#pretext-editor')).toBeEmpty();
  const status = page.getByRole('status').filter({ hasText: 'pages indexed' });
  await expect(status).toHaveText('4 pages indexed');
  const reader = page.getByRole('region', { name: 'Document pages' });
  const mounted = reader.locator('[data-page]');
  await expect(mounted).toHaveCount(2);
  await page.evaluate(() => {
    const lab = document.querySelector('#lab-root');
    if (!lab) throw new Error('Missing lab root');
    const watch = () => {
      const count = lab.querySelectorAll('.pm-page').length;
      lab.setAttribute(
        'data-max-pages',
        String(Math.max(count, Number(lab.getAttribute('data-max-pages')))),
      );
    };
    new MutationObserver(watch).observe(lab, { childList: true, subtree: true });
    watch();
  });

  await page.getByRole('combobox', { name: 'Document', exact: true }).selectOption('long');
  await expect(status).toHaveText('300 pages indexed');
  await expect(mounted).toHaveCount(2);
  await expect(
    page.locator('#lab-root .de-document-editor__measure, #lab-root .pretext-oracle'),
  ).toHaveCount(0);

  await page.getByLabel('Page', { exact: true }).fill(String(largePage));
  await page.getByRole('button', { name: 'Go to page' }).click();
  await expect(mounted).toHaveCount(3);
  await expect(
    mounted
      .filter({ has: page.locator('[data-id^="workload-"]') })
      .and(page.locator(`[data-page="${String(largePage)}"]`)),
  ).toBeInViewport();
  await expect(mounted.and(page.locator('[data-page="1"]'))).toHaveCount(0);
  await expect(page.locator('#lab-root')).toHaveAttribute('data-max-pages', '3');
  expect(await reader.evaluate((element) => element.scrollHeight)).toBeGreaterThan(300_000);

  await page.getByLabel('Overscan').fill('0');
  await page.getByLabel('Overscan').press('Tab');
  await expect(mounted).toHaveCount(1);
  await reader.evaluate((element) => {
    const sheet = element.querySelector<HTMLElement>('[data-page]');
    if (!sheet) throw new Error('Missing mounted page');
    element.scrollTop = sheet.offsetTop + sheet.offsetHeight + 2;
  });
  await expect(mounted).toHaveAttribute('data-page', String(largePage + 1));

  await page.getByRole('combobox', { name: 'Document', exact: true }).selectOption('unsupported');
  await expect(page.locator('#pretext-status')).toHaveText(
    /unsupported-rule.*unsupported block horizontal_rule/u,
  );
  // A paragraph of only white space is laid out in the editor's pre-wrap, so it is not reported.
  await expect(page.locator('#pretext-status')).not.toContainText('only-whitespace');
  await expect(mounted).toHaveCount(0);
});

test('DOCE-LABS-5.2 compares natural HTML offsets, heights, boundaries and overflow at three widths', async ({
  page,
}, info) => {
  await page.goto(`${url}?measure`);
  await expect(page.locator('#pretext-editor')).toBeEmpty();
  const parity = await page.evaluate(async () =>
    Promise.all([600, 510, 375].map((width) => window.pretextPagination.verify('examples', width))),
  );
  await info.attach('HTML parity', {
    body: JSON.stringify(parity, null, 2),
    contentType: 'application/json',
  });
  for (const result of parity) {
    expect(result.sourceUnchanged).toBe(true);
    expect(result.comparedBlocks).toBe(64);
    expect(result.htmlPages).toBe(result.predictedPages);
    expect(result.boundaryMismatches).toEqual([]);
    expect(result.overflow).toEqual([]);
    expect(result.differences).toEqual([]);
    expect(result.pageDifferences).toEqual([]);
    expect(result.comparedPages).toBe(result.predictedPages);
    expect(
      result.predictedBoundaries.flat().filter(([id]) => id === 'split-paragraph').length,
    ).toBeGreaterThan(1);
  }
  expect(parity.map(({ htmlPages }) => htmlPages)).toEqual([4, 4, 5]);

  const production = await page.evaluate(() =>
    window.pretextPagination.compareProductionBoundaries(),
  );
  expect(production.html.length).toBeGreaterThan(1);
  expect(production.predicted).toEqual(production.html);
});

test('DOCE-LABS-5.1 reuses prepared rich text when only page width changes', async ({ page }) => {
  await page.goto(`${url}?measure`);
  const result = await page.evaluate(() => window.pretextPagination.compare('medium'));
  expect(result.predicted.cold.misses).toBeGreaterThan(0);
  expect(result.predicted.warm.misses).toBe(result.predicted.cold.misses);
  expect(result.predicted.warm.hits - result.predicted.cold.hits).toBe(380);
  expect(result.predicted.cold.mountedPages).toBeLessThan(result.baseline.cold.mountedPages);
  expect(result.predicted.warm.mountedPages).toBeLessThan(result.baseline.warm.mountedPages);
});

test('DOCE-LABS-5.6 counts a word or an atom past the edge as overflow, and white space not', async ({
  page,
}) => {
  await page.goto(`${url}?measure`);
  const found = await page.evaluate(() =>
    window.pretextPagination.overflowControls({
      word: `<p style="white-space: nowrap">${'words forced past the edge '.repeat(4)}</p>`,
      atom: '<p><img alt="" style="display: inline-block; width: 320px; height: 10px"></p>',
      space: `<p style="white-space: pre">short<code>${' '.repeat(200)}</code></p>`,
      fits: '<p>a short line</p>',
    }),
  );
  // White space past the edge, as inline code's end padding after a hanging space was in G3, scrolls
  // the page sideways yet holds no word past the edge.
  expect(found).toEqual({
    word: { scrolls: true, past: true },
    atom: { scrolls: true, past: true },
    space: { scrolls: true, past: false },
    fits: { scrolls: false, past: false },
  });
});
