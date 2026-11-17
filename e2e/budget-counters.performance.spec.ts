import {
  type Budget,
  BUDGETS,
  measureRemoteKeystrokes,
  measureSectionsEdit,
  measureStartup,
  measureStyleScope,
  measureWheel,
} from './budgets.js';
import { expect, test } from './fixtures.js';

// The counter budgets (specs/LABS.md DOCE-LABS-2.5): the budgets counted in layouts, sections,
// blocks and elements rather than time, which do not depend on the machine, held on every pull
// request. A budget the editor does not meet yet is an expected failure naming its gap in the port
// plan (`test.fail`, with the gap as an annotation); when the gap's work lands, the budget is met
// and its mark comes off.

test.describe.configure({ timeout: 180_000 });

function expectMeets(budget: Budget, value: number) {
  expect(budget.meets(value), `${budget.metric}: ${String(value)}, target ${budget.target}`).toBe(
    true,
  );
}

test.describe('counter budgets', () => {
  test('DOCE-LABS-2.5 converges in at most four layouts after an edit in the middle of 25 sections', async ({
    lab,
    page,
  }) => {
    const { layouts, regions } = await measureSectionsEdit(lab, page);
    expectMeets(BUDGETS.convergeLayouts, layouts);
    expectMeets(BUDGETS.regionsRendered, regions);
  });

  test('DOCE-LABS-2.5 reuses at least 23 of 25 sections per layout after an edit in one', async ({
    lab,
    page,
  }) => {
    const { sectionsReused } = await measureSectionsEdit(lab, page);
    expectMeets(BUDGETS.sectionsReused, sectionsReused);
  });

  test('DOCE-LABS-2.5 opens 24 pages in two layouts, measuring each block once and settling for good', async ({
    lab,
    page,
  }) => {
    const { layouts, remeasured, afterSettle } = await measureStartup(lab, page);
    expectMeets(BUDGETS.startupLayouts, layouts);
    expectMeets(BUDGETS.startupRemeasured, remeasured);
    expectMeets(BUDGETS.startupAfterSettle, afterSettle);
  });

  test('DOCE-LABS-2.5 DOCE-PAGINATION-5.17 lays out a remote keystroke that starts a line in 1600 blocks without relaying the document', async ({
    lab,
    page,
  }) => {
    const { inLineLayouts, newLineMissed, sectionsRelaid, blocksMeasured } =
      await measureRemoteKeystrokes(lab, page);
    // A keystroke inside a line keeps its block's height and needs no layout (DOCE-PAGINATION-5.17);
    // one that starts a new line lays the pages out, and is the one the budgets count.
    expect(inLineLayouts).toBe(0);
    expect(newLineMissed).toBe(0);
    expectMeets(BUDGETS.remoteSectionsRelaid, sectionsRelaid);
    expectMeets(BUDGETS.remoteBlocksMeasured, blocksMeasured);
  });

  test('DOCE-LABS-2.5 lays the page out at most three times per wheel event, on 5 pages as on 40', async ({
    lab,
    page,
  }) => {
    const { five, forty, runs } = await measureWheel(lab, page);
    expectMeets(BUDGETS.wheel5, five);
    expectMeets(BUDGETS.wheel40, forty);
    // Scrolling lays out no pages: each document keeps its pages, the large one more of them.
    const [small, large] = runs;
    for (const run of runs) expect(run.pagesAfter).toBe(run.pagesBefore);
    expect(large?.pagesBefore ?? 0).toBeGreaterThan(small?.pagesBefore ?? 0);
  });

  test('DOCE-LABS-2.5 restyles at most three times as many elements per keystroke on 40 pages as on 5, and at most 800 for an Enter', async ({
    lab,
    page,
  }) => {
    const { keys, enter, heights } = await measureStyleScope(lab, page);
    expectMeets(BUDGETS.styleScope, keys);
    expectMeets(BUDGETS.styleScopeEnter, enter);
    // The keys typed keep their block's height, so they lay nothing out.
    for (const { before, after } of heights) expect(after).toBe(before);
  });
});
