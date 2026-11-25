import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const content = (page: Page) => page.locator('.de-document-editor__content');
const options = (page: Page) => page.getByRole('group', { name: 'Host options' });
const issues = (page: Page, text: string) =>
  content(page).locator('[data-proofing-issue]', { hasText: text });
const menu = (page: Page) => page.getByRole('menu', { name: 'Document actions' });
const openAgain = (page: Page) => options(page).getByRole('button', { name: 'Open again' }).click();

// Opens the document again with the samples: abbreviations with issues, math that does not
// typeset, a word the reader ignores everywhere and a host record link in a script's output.
async function openWithSamples(page: Page) {
  await options(page).getByLabel('Abbreviation, math and record link samples (on opening)').check();
  await openAgain(page);
  await expect(content(page).locator('a[href="#record/SD-100"]')).toHaveCount(1);
}

// Opens the context menu on a locator, once its page is drawn and it takes the pointer.
async function rightClick(page: Page, target: ReturnType<Page['locator']>) {
  await target.hover();
  await target.click({ button: 'right' });
  await expect(menu(page)).toBeVisible();
}

test.describe('full editor lab host options', () => {
  test('DOCE-LABS-3.12 DOCE-PROOFING-1.8 DOCE-PROOFING-2.8 turns proofing off and on, and keeps the reader decisions', async ({
    lab,
    page,
  }) => {
    await lab.open('full-editor');
    await openWithSamples(page);
    // The word the host kept as ignored is not marked.
    await expect(issues(page, 'teh')).toHaveCount(1);
    await expect(issues(page, 'recieve')).toHaveCount(0);
    await expect(options(page).getByLabel('Kept decisions')).toHaveText('ignore recieve');
    await options(page).getByLabel('Proofing').uncheck();
    await expect(content(page).locator('[data-proofing-issue]')).toHaveCount(0);
    await options(page).getByLabel('Proofing').check();
    await expect(issues(page, 'teh')).toHaveCount(1);
    // Ignoring a word everywhere is told to the host, which gives it back on the next opening.
    await rightClick(page, issues(page, 'teh').first());
    await menu(page).getByRole('menuitem', { name: 'Spelling', exact: true }).click();
    await page.getByRole('menu').last().getByRole('menuitem', { name: 'Ignore all' }).click();
    await expect(options(page).getByLabel('Kept decisions')).toHaveText(
      'ignore recieve, ignore teh',
    );
    await openAgain(page);
    await expect(issues(page, 'TBD')).toHaveCount(1);
    await expect(issues(page, 'teh')).toHaveCount(0);
  });

  test('DOCE-PROOFING-1.9 waits for the host to run the first check', async ({ lab, page }) => {
    await lab.open('full-editor');
    await options(page).getByLabel('First check').selectOption('host');
    await openAgain(page);
    const run = options(page).getByRole('button', { name: 'Run the first check' });
    await expect(run).toBeEnabled();
    await page.waitForTimeout(600);
    await expect(content(page).locator('[data-proofing-issue]')).toHaveCount(0);
    await run.click();
    await expect(issues(page, 'teh')).toHaveCount(1);
    await expect(run).toBeDisabled();
  });

  test('DOCE-AUTOMATION-3.8 offers a completion answer as the host normalises it', async ({
    lab,
    page,
  }) => {
    await lab.open('full-editor');
    await options(page).getByLabel('Completion answers').selectOption('host');
    await content(page).locator('h1', { hasText: 'Power' }).click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Recovery takes');
    await expect(content(page).locator('.de-inline-completion')).toHaveText(
      ' less than one second. It is logged.',
    );
  });

  test('DOCE-EDITOR-4.8 DOCE-EDITOR-6.28 gives scripts and exports the template the document pins', async ({
    lab,
    page,
  }) => {
    await lab.open('full-editor');
    const given = options(page).getByLabel('Template given');
    const status = content(page).locator('.script-block').first().locator('.script-output p');
    await rightClick(page, status);
    await menu(page).getByRole('menuitem', { name: 'Run script', exact: true }).click();
    await expect(given).toHaveText('none');
    await options(page).getByLabel('Pin template revision').check();
    await rightClick(page, status);
    await menu(page).getByRole('menuitem', { name: 'Run script', exact: true }).click();
    await expect(given).toHaveText('full-editor rev-3');
    await options(page).getByLabel('Pin template revision').uncheck();
    const menubar = page.getByRole('menubar', { name: 'Menu' });
    await menubar.getByRole('menuitem', { name: 'File' }).click();
    await page.getByRole('menuitem', { name: 'Export' }).click();
    await page.getByRole('menuitem', { name: 'Markdown' }).click();
    await expect(given).toHaveText('none');
  });

  test('DOCE-EDITOR-4.12 disables the markup the host turns off, saying why', async ({
    lab,
    page,
  }) => {
    await lab.open('full-editor');
    await options(page).getByLabel('Restrict change bars').check();
    await page.getByRole('toolbar', { name: 'Formatting' }).locator('[data-item="markup"]').click();
    const bars = page.getByRole('menuitemcheckbox', { name: /Change bars/ });
    await expect(bars).toBeDisabled();
    await expect(bars).toContainText('Change bars are off while the review is open');
    await page.keyboard.press('Escape');
    await options(page).getByLabel('Restrict change bars').uncheck();
    await page.getByRole('toolbar', { name: 'Formatting' }).locator('[data-item="markup"]').click();
    await expect(page.getByRole('menuitemcheckbox', { name: /Change bars/ })).toBeEnabled();
  });

  test('DOCE-EDITOR-3.1 keeps the selection on a host record link in generated content', async ({
    lab,
    page,
  }) => {
    await lab.open('full-editor');
    await openWithSamples(page);
    await content(page).locator('h1', { hasText: 'Timing' }).click();
    await page.keyboard.press('End');
    await rightClick(page, content(page).locator('a[href="#record/SD-100"]'));
    await page.keyboard.press('Escape');
    await expect(menu(page)).toHaveCount(0);
    await page.keyboard.type(' plan');
    await expect(content(page).locator('h1', { hasText: 'Timing plan' })).toHaveCount(1);
  });

  test('DOCE-HOST-3.9 DOCE-OBJECTS-4.7 marks saved script output stale once the runner keys its inputs', async ({
    lab,
    page,
  }) => {
    await lab.open('full-editor');
    const status = content(page).locator('.script-block').first();
    await expect(status).not.toHaveAttribute('data-script-state', 'stale');
    await options(page).getByLabel('Runner keys script inputs (on opening)').check();
    await openAgain(page);
    await expect(status).toHaveAttribute('data-script-state', 'stale');
    // A run records the key of what it read, so its output is current again.
    await rightClick(page, status.locator('.script-output p'));
    await menu(page).getByRole('menuitem', { name: 'Run script', exact: true }).click();
    await expect(status.locator('.script-output')).toContainText(/^Status: \d+ blocks\.$/);
    await expect(status).not.toHaveAttribute('data-script-state', 'stale');
  });

  test('DOCE-OBJECTS-1.7 shows the host text for math that does not typeset', async ({
    lab,
    page,
  }) => {
    await lab.open('full-editor');
    await openWithSamples(page);
    const math = content(page).locator('.de-math[data-state="invalid"]');
    await expect(math).toHaveCount(1);
    await expect(math).toHaveText('Math to fix');
  });

  test('DOCE-FOOTNOTES-1.2 cites footnotes only where the host lets', async ({ lab, page }) => {
    await lab.open('full-editor');
    await options(page).getByLabel('Footnotes in tables (on opening)').uncheck();
    await openAgain(page);
    const markers = content(page).locator('.footnote-reference');
    const before = await markers.count();
    // Not in a table cell, which this host leaves out.
    await content(page).locator('td', { hasText: 'Start' }).first().click();
    await page.keyboard.press('End');
    await page.keyboard.press('ControlOrMeta+Alt+f');
    await expect(markers).toHaveCount(before);
    // In a list item, which it keeps.
    await content(page).locator('li', { hasText: 'Maintenance' }).first().click();
    await page.keyboard.press('End');
    await page.keyboard.press('ControlOrMeta+Alt+f');
    await expect(markers).toHaveCount(before + 1);
  });

  test('DOCE-OUTLINE-1.4 highlights the chapters a review covers, with their subheadings', async ({
    lab,
    page,
  }) => {
    await lab.open('full-editor');
    const scope = page.getByRole('group', { name: 'Review scope' });
    await scope.getByLabel('Timing', { exact: true }).check();
    const highlights = scope.getByRole('list', { name: 'Outline highlights' });
    await expect(highlights.getByRole('listitem')).toHaveText([
      /Timing: In review$/,
      /Timing conditions: In review$/,
      /Timing responses: In review$/,
    ]);
    await expect(content(page).locator('[data-review-scope]').first()).toBeVisible();
    await scope.getByLabel('Timing', { exact: true }).uncheck();
    await expect(highlights.getByRole('listitem')).toHaveCount(0);
    await expect(content(page).locator('[data-review-scope]')).toHaveCount(0);
  });

  test('DOCE-REFERENCES-2.3 DOCE-REFERENCES-3.3 marks abbreviation issues and refreshes them on opening', async ({
    lab,
    page,
  }) => {
    await lab.open('full-editor');
    await openWithSamples(page);
    const issue = (kind: string) => content(page).locator(`[data-abbreviation-issue="${kind}"]`);
    await expect(issue('missing')).toHaveCount(1);
    await expect(issue('archived')).toHaveCount(1);
    await expect(issue('duplicate')).toHaveCount(2);
    // Opening brought the cited entry's expansion up to date with the glossary.
    await expect(content(page)).toContainText('Ground support equipment');
    await expect(content(page)).not.toContainText('Ground equipment');
    await options(page).getByLabel('Refresh abbreviations (on opening)').uncheck();
    await openAgain(page);
    await expect(content(page)).toContainText('Ground equipment');
  });
});
