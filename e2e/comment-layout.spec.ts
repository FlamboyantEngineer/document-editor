import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const content = (page: Page) => page.locator('.de-document-editor__content');
const margin = (page: Page) => page.getByRole('list', { name: 'Comments' });
const QUOTE = 'portrait pages again';

// The thread's text and its card, both in view.
async function shown(page: Page) {
  const mark = content(page).locator('mark[data-comment-id]', { hasText: QUOTE });
  await mark.scrollIntoViewIfNeeded();
  const card = margin(page)
    .locator(':scope > [role="listitem"]')
    .filter({ hasText: QUOTE })
    .locator('.de-document-comments__card');
  await expect(card).toBeVisible();
  return { mark, card };
}

// How far the card starts from its page's end edge, and how far its top is from its text's.
async function placement(page: Page) {
  const { mark, card } = await shown(page);
  const edges = await mark.evaluate((element) => {
    const box = element.closest('.pm-page')?.getBoundingClientRect();
    return { right: box?.right ?? 0, top: element.getBoundingClientRect().top };
  });
  const box = await card.boundingBox();
  return {
    gap: Math.round((box?.x ?? 0) - edges.right),
    rise: Math.abs((box?.y ?? 0) - edges.top),
  };
}

const settled = (page: Page) =>
  expect.poll(async () => (await placement(page)).gap, { timeout: 10_000 }).toBe(20);

test.describe('comment layout', () => {
  test.beforeEach(async ({ lab }) => {
    await lab.open('full-editor');
  });

  test('DOCE-COMMENTS-3.5 keeps each card beside its page, and the same card, as the side panels fold and unfold', async ({
    page,
  }) => {
    await settled(page);
    const { card } = await shown(page);
    // Tag the card's element: the same element must stay through the panels' changes.
    await card.evaluate((element) => element.setAttribute('data-test-kept', 'yes'));
    const added = await page.evaluateHandle(() => {
      const counter = { cards: 0 };
      new MutationObserver((records) => {
        for (const record of records)
          for (const node of record.addedNodes)
            if (node instanceof HTMLElement && node.querySelector('.de-document-comments__card'))
              counter.cards += 1;
      }).observe(document.body, { childList: true, subtree: true });
      return counter;
    });
    const details = page.getByRole('region', { name: 'Details' });
    await details.getByRole('button', { name: /collapse/i }).click();
    await settled(page);
    await page.getByLabel('Side panels').uncheck();
    await settled(page);
    // Scrolling still moves the stage while the panels come back.
    await page.getByLabel('Side panels').check();
    await page.mouse.wheel(0, 200);
    await settled(page);
    expect((await placement(page)).rise).toBeLessThan(16);
    await expect(card).toHaveAttribute('data-test-kept', 'yes');
    expect(await added.evaluate((counter) => counter.cards)).toBe(0);
  });

  test('DOCE-COMMENTS-3.5 keeps cards and markers beside their text when zoomed and at a narrow width', async ({
    page,
  }) => {
    await settled(page);
    const zoom = page.getByRole('group', { name: 'Zoom' });
    await zoom.getByRole('button', { name: /Zoom in/i }).click();
    await zoom.getByRole('button', { name: /Zoom in/i }).click();
    await expect.poll(async () => (await placement(page)).rise).toBeLessThan(16);
    await page.setViewportSize({ width: 640, height: 800 });
    await expect.poll(async () => (await placement(page)).rise).toBeLessThan(16);
    // Markers stay where the reader can press them: one opens its card.
    await page.getByLabel('Comment markers').check();
    const mark = content(page).locator('mark[data-comment-id]', { hasText: QUOTE });
    await mark.scrollIntoViewIfNeeded();
    await mark.click();
    const opened = margin(page).locator('.de-document-comments__card').filter({ hasText: QUOTE });
    await expect(opened).toBeVisible();
    await expect(opened).toBeInViewport();
  });

  test('DOCE-COMMENTS-2.23 keeps the markers with no markup', async ({ page }) => {
    await page.getByLabel('Comment markers').check();
    const markers = margin(page).locator(':scope > [role="listitem"]');
    const count = await markers.count();
    expect(count).toBeGreaterThan(0);
    const menubar = page.getByRole('menubar', { name: 'Menu' });
    await menubar.getByRole('menuitem', { name: 'View' }).click();
    await page.getByRole('menuitem', { name: 'Markup' }).click();
    await page.getByRole('menuitemcheckbox', { name: 'No markup' }).click();
    await expect(page.locator('.de-document-editor')).toHaveAttribute('data-markup', 'final');
    await expect(markers).toHaveCount(count);
  });
});
