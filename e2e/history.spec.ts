import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const editor = (page: Page) => page.getByRole('textbox', { name: 'Sample document' });
const history = (page: Page) => page.getByRole('complementary');
const row = (page: Page, name: RegExp) => history(page).getByRole('row', { name });

test.describe('history lab', () => {
  test('DOCE-VERSIONS-4.6 lists versions with the automatic ones folded under named ones', async ({
    lab,
    page,
  }) => {
    await lab.open('history');
    await expect(row(page, /First draft/)).toBeVisible();
    await expect(history(page).getByRole('row')).toHaveCount(3);
    await history(page)
      .getByRole('button', { name: /earlier version/ })
      .click();
    await expect(history(page).getByRole('row')).toHaveCount(4);
    await expect(row(page, /First draft/)).toContainText('Template report');
  });

  test('DOCE-VERSIONS-4.3 saves a named version', async ({ lab, page }) => {
    await lab.open('history');
    await page.getByRole('button', { name: 'Save version…' }).click();
    await page.getByRole('textbox', { name: 'Name' }).fill('Approved');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(row(page, /Approved/)).toBeVisible();
  });

  test('DOCE-VERSIONS-5.1 DOCE-VERSIONS-5.3 DOCE-VERSIONS-5.4 views a version with its template and returns', async ({
    lab,
    page,
  }) => {
    await lab.open('history');
    await page.getByLabel('Markup').selectOption('final');
    await row(page, /First draft/).click();
    await expect(page.getByLabel('Showing')).toHaveText('rev-2');
    await expect(page.getByLabel('Template shown')).toHaveText('report');
    await expect(page.getByText('Viewing First draft')).toBeVisible();
    await expect(page.getByText('Shown with template report')).toBeVisible();
    await expect(editor(page)).toContainText('within one second of detecting it');
    await expect(editor(page)).toHaveAttribute('contenteditable', 'false');
    await page.getByLabel('Markup').selectOption('all');
    await page.getByLabel('Comments').uncheck();
    await page.getByRole('button', { name: 'Return to the current version' }).click();
    await expect(page.getByLabel('Showing')).toHaveText('The document');
    await expect(page.getByLabel('Reader settings')).toHaveText('final markup, comments shown');
    await expect(editor(page)).toContainText('within two seconds of detecting it');
  });

  test('DOCE-VERSIONS-4.5 restores a version and saves it', async ({ lab, page }) => {
    await lab.open('history');
    await row(page, /First draft/)
      .getByRole('button', { name: /actions/i })
      .click();
    await page.getByRole('menuitem', { name: /restore/i }).click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: /restore/i })
      .click();
    await expect(editor(page)).toContainText('within one second of detecting it');
    await expect(page.getByLabel('Template shown')).toHaveText('report');
    await expect(history(page).getByRole('row')).toHaveCount(4);
  });
});
