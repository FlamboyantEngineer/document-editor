import { expect, test } from './fixtures.js';

test('DOCE-LABS-5.5 opens the middle page from the index without mounting earlier pages', async ({
  page,
  lab,
}) => {
  // Observe insertions from before any lab script runs, including nodes removed in the same frame.
  await page.addInitScript(() => {
    const seen = new Set<string>();
    new MutationObserver((records) => {
      for (const { addedNodes } of records) {
        for (const node of addedNodes) {
          if (!(node instanceof Element)) continue;
          const sheets = node.matches('.pm-page') ? [node] : node.querySelectorAll('.pm-page');
          for (const sheet of sheets) seen.add(sheet.getAttribute('data-page') ?? 'unindexed');
        }
      }
      if (seen.size) document.documentElement.dataset.seenPages = [...seen].sort().join(',');
    }).observe(document, { childList: true, subtree: true });
  });
  await lab.open('index');
  await page.getByRole('radio', { name: 'Dark', exact: true }).click();
  const link = page.getByRole('link', { name: 'Pretext virtual pages · Open page 150' });
  await expect(link).toHaveAttribute('href', 'pretext-page-link.html?theme=dark#page=150');
  await link.click();
  const status = page.getByRole('status').filter({ hasText: 'Mounted pages' });
  const middle = page.getByRole('article', { name: 'Page 150 of 300', exact: true });
  await expect(middle).toBeInViewport();
  await expect(status).toHaveText('Page 150 of 300 · Mounted pages 149–151 (3 in the DOM)');
  await expect(page.locator('html')).toHaveAttribute('data-seen-pages', '149,150,151');
  await expect(page.locator('.ProseMirror, .de-document-editor__measure')).toHaveCount(0);
  const middleUrl = page.url();
  await page.getByRole('link', { name: 'First page' }).click();
  await expect(status).toHaveText('Page 1 of 300 · Mounted pages 1–2 (2 in the DOM)');
  await expect(middle).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(middleUrl);
  await expect(middle).toBeInViewport();
  await page.reload();
  await expect(middle).toBeInViewport();
  await expect(page.locator('html')).toHaveAttribute('data-seen-pages', '149,150,151');
});

test('DOCE-LABS-5.5 bounds a linked page and follows the same link after scrolling', async ({
  page,
}) => {
  await page.goto('/pretext-page-link.html?stylesheet=none#page=9999');
  const reader = page.getByRole('region', { name: 'Document pages' });
  await expect(reader.getByRole('article', { name: 'Page 300 of 300' })).toBeInViewport();
  const link = page.getByRole('link', { name: 'Page 150' });
  await link.click();
  const middle = reader.getByRole('article', { name: 'Page 150 of 300' });
  await expect(middle).toBeInViewport();
  await reader.evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect(middle).toHaveCount(0);
  await link.click();
  await expect(middle).toBeInViewport();
  await expect(reader.getByRole('article')).toHaveCount(3);
});
