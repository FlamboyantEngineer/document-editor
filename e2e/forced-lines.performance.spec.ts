import type { Page } from '@playwright/test';
import { type Budget, BUDGETS, caretAtEnd, keystrokeWork, percentile } from './budgets.js';
import { expect, test, waitForLab } from './fixtures.js';

// The typing budgets (DOCE-LABS-2.3) with every paragraph drawn on Pretext's lines (the forced-lines
// spike), beside the same documents drawn with the browser's own lines, as the editor is today.

const SIZE = { pages40: 1, pages300: 2 } as const;
// The chosen set-up: lines drawn on the pages' own view, and pages off screen skipping their layout.
// FORCED_QUERY measures another, such as `&skip` for the lines as canonical decorations.
const FORCED = process.env.FORCED_QUERY ?? '&direct&skip';

async function typingWork(page: Page, size: number, forced: boolean) {
  await page.goto(`forced-lines.html?size=${String(size)}${forced ? FORCED : '&forced=off'}`);
  await expect(page.locator('html')).toHaveAttribute('data-lab-ready', 'true', {
    timeout: 120_000,
  });
  await waitForLab(page);
  await caretAtEnd(page, 3);
  return percentile(await keystrokeWork(page, 60), 0.95);
}

function measure(budget: Budget, size: number) {
  test(`${budget.metric} with forced lines within its budget`, async ({ page }) => {
    test.setTimeout(240_000);
    const browser = await typingWork(page, size, false);
    const forced = await typingWork(page, size, true);
    test.info().annotations.push({
      type: budget.metric,
      description: `forced ${String(forced)}, browser lines ${String(browser)} (target ${budget.target})`,
    });
    console.log(`${budget.metric}: forced ${String(forced)}, browser ${String(browser)}`);
    expect(budget.meets(forced), `${budget.metric}: ${String(forced)}`).toBe(true);
  });
}

test.describe('DOCE-LABS-6.2 Forced lines spike typing', () => {
  measure(BUDGETS.latency40, SIZE.pages40);
  measure(BUDGETS.latency300, SIZE.pages300);
});
