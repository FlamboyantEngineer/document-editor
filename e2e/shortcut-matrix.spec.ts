import type { Page } from '@playwright/test';
import { expect, test, waitForLab } from './fixtures.js';

const content = (page: Page) => page.locator('.de-document-editor__content');

// The middle of the first occurrence of a word in the document, scrolled into view.
async function wordAt(page: Page, word: string) {
  const point = await content(page).evaluate(async (element, text) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.textContent?.indexOf(text) ?? -1;
      if (at < 0) continue;
      node.parentElement?.scrollIntoView({ block: 'center' });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + text.length);
      const rect = range.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
    return null;
  }, word);
  if (!point) throw new Error(`No word ${word}`);
  return point;
}

// A word of each kind of place the keys must reach: a list item, a table cell, a quote and a
// footnote's text.
const SURFACES = [
  { surface: 'a list item', word: 'Plain' },
  { surface: 'a table cell', word: 'Rainfall' },
  { surface: 'a quote', word: 'Quoted' },
  { surface: 'a footnote', word: 'Measured' },
] as const;

for (const layout of ['page', 'web'] as const) {
  for (const { surface, word } of SURFACES) {
    test(`DOCE-EDITOR-6.2 runs the shortcut table's keys in ${surface} in the ${layout} layout`, async ({
      lab,
      page,
    }) => {
      void lab;
      await page.goto(`regression.html?document=footnotes-in-structures&layout=${layout}`);
      await waitForLab(page);
      const point = await wordAt(page, word);
      await page.mouse.dblclick(point.x, point.y);
      await expect
        .poll(() => page.evaluate(() => document.getSelection()?.toString().trim()))
        // A footnote's number right after the word is selected with it.
        .toMatch(new RegExp(`^${word}`));
      const bold = content(page).locator('strong', { hasText: word });
      await page.keyboard.press('ControlOrMeta+b');
      await expect(bold).toHaveCount(1);
      await page.keyboard.press('ControlOrMeta+z');
      await expect(bold).toHaveCount(0);
      await page.keyboard.press('ControlOrMeta+Shift+z');
      await expect(bold).toHaveCount(1);
    });
  }
}
