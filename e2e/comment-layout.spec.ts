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

  test('DOCE-COMMENTS-3.5 sets each marker beside its page, and keeps it in view as the stage scrolls sideways', async ({
    page,
  }) => {
    await page.getByLabel('Comment markers').check();
    const marker = margin(page).locator('.ui-annotation-layer__marker').first();
    // The marker's place against the page beside it, and against what the stage shows.
    const where = () =>
      marker.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const stage = element.closest('.ui-scroll-region__viewport');
        const shown = stage?.getBoundingClientRect();
        const sheet = [...document.querySelectorAll('.pm-page')]
          .map((each) => each.getBoundingClientRect())
          .find((each) => each.top <= box.top && box.top <= each.bottom);
        return {
          gap: Math.round(box.left - (sheet?.right ?? 0)),
          inside: !!shown && box.left >= shown.left && box.right <= shown.right,
          room: (stage?.scrollWidth ?? 0) - (stage?.clientWidth ?? 0),
        };
      });
    const stage = page.locator('.de-document-editor__viewport .ui-scroll-region__viewport');
    const scrollTo = (left: number) =>
      stage.evaluate((element, x) => {
        element.scrollLeft = x;
      }, left);
    // With the side panels open the stage is narrower than the page: the marker stays in view.
    await expect.poll(async () => (await where()).inside).toBe(true);
    expect((await where()).room).toBeGreaterThan(0);
    // Scrolled to the page's end edge, the marker sits beside it again, and still opens its card.
    await scrollTo(10_000);
    await expect.poll(async () => (await where()).gap).toBe(20);
    expect((await where()).inside).toBe(true);
    await scrollTo(0);
    await expect.poll(async () => (await where()).gap).toBeLessThan(20);
    expect((await where()).inside).toBe(true);
    await marker.click();
    await expect(margin(page).locator('.de-document-comments__card')).toBeVisible();
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

  test('DOCE-COMMENTS-2.23 centres the pages with markers until a card opens, then the pages and margin as a pair', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 2600, height: 900 });
    await page.getByLabel('Side panels').uncheck();
    await page.getByLabel('Comment markers').check();
    const layer = page.locator('.de-document-comments');
    await expect(layer).toHaveAttribute('data-cards-open', 'false');
    // The centre of the stage and of what it shows: the first page, then the pages with the margin.
    const centres = () =>
      layer.evaluate((element) => {
        const stage = element.parentElement?.getBoundingClientRect();
        const first = element.querySelector('.pm-page')?.getBoundingClientRect();
        const pages = element
          .querySelector('.de-document-editor__content')
          ?.getBoundingClientRect();
        const strip = element.querySelector('.de-document-comments__margin');
        const columns = getComputedStyle(element).gridTemplateColumns.split(' ');
        return {
          stage: stage ? (stage.left + stage.right) / 2 : 0,
          page: first ? (first.left + first.right) / 2 : 0,
          margin: parseFloat(columns[1] ?? '-1'),
          pair: pages && strip ? (pages.left + strip.getBoundingClientRect().right) / 2 : 0,
        };
      });
    await expect.poll(async () => (await centres()).margin).toBe(0);
    const closed = await centres();
    expect(Math.abs(closed.page - closed.stage)).toBeLessThan(2);
    await margin(page).locator('.ui-annotation-layer__marker').first().click();
    await expect(layer).toHaveAttribute('data-cards-open', 'true');
    await expect.poll(async () => (await centres()).margin).toBeGreaterThan(0);
    const open = await centres();
    expect(Math.abs(open.pair - open.stage)).toBeLessThan(2);
  });
});
