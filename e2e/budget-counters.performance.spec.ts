import {
  type Budget,
  BUDGETS,
  measureRemoteKeystrokes,
  measureSectionsEdit,
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

  test('DOCE-LABS-2.5 lays out a remote keystroke in 1600 blocks without relaying the document', async ({
    lab,
    page,
  }) => {
    const { sectionsRelaid, blocksMeasured } = await measureRemoteKeystrokes(lab, page);
    expectMeets(BUDGETS.remoteSectionsRelaid, sectionsRelaid);
    expectMeets(BUDGETS.remoteBlocksMeasured, blocksMeasured);
  });

  test('DOCE-LABS-2.5 lays the page out at most three times per wheel event, on 5 pages as on 40', async ({
    lab,
    page,
  }) => {
    const { five, forty } = await measureWheel(lab, page);
    expectMeets(BUDGETS.wheel5, five);
    expectMeets(BUDGETS.wheel40, forty);
  });

  test('DOCE-LABS-2.5 restyles at most three times as many elements per keystroke on 40 pages as on 5', async ({
    lab,
    page,
  }) => {
    expectMeets(BUDGETS.styleScope, await measureStyleScope(lab, page));
  });
});
