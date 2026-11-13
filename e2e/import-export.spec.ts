import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const content = (page: Page) => page.locator('.de-document-editor__content');
const report = (page: Page) => page.getByRole('status', { name: 'Import report' });
const warnings = (page: Page) => page.getByRole('list', { name: 'Import warnings' });
const written = (page: Page) => page.getByRole('region', { name: 'Written document' });

test.describe('import and export', () => {
  test('DOCE-LABS-3.4 reads Markdown into the body with its warnings', async ({ lab, page }) => {
    await lab.open('import-export');
    await page.getByRole('button', { name: 'Read the sample Markdown' }).click();
    await expect(report(page)).toHaveText('The sample Markdown');
    await expect(content(page)).toContainText('Imported notes');
    await expect(content(page).locator('table')).toContainText('28 V');
    await expect(content(page)).toContainText('The limits apply at sea level.');
    await expect(warnings(page)).toContainText('content-left-out');
  });

  test('DOCE-LABS-3.4 writes the document as Word and reads it back, within the archive limits', async ({
    lab,
    page,
  }) => {
    await lab.open('import-export');
    await page.getByRole('button', { name: 'Write as Word and read it back' }).click();
    await expect(report(page)).toContainText('The document written as Word:');
    await expect(content(page)).toContainText('Interfaces');

    await page.getByRole('checkbox', { name: 'Allow only 5 files in an archive' }).check();
    await page.getByRole('button', { name: 'Write as Word and read it back' }).click();
    await expect(report(page)).toContainText('could not be read: too-large');
  });

  test('DOCE-LABS-3.4 reads pasted HTML into the section picked', async ({ lab, page }) => {
    await lab.open('import-export');
    await page.getByLabel('Into the section').selectOption('appendix');
    await page.getByRole('button', { name: 'Read the HTML' }).click();
    await expect(report(page)).toHaveText('The pasted HTML');
    await expect(content(page)).toContainText('Pasted from a web page');
  });

  test('DOCE-LABS-3.4 writes Markdown with front matter, comments and suggestions, whole or in part', async ({
    lab,
    page,
  }) => {
    await lab.open('import-export');
    await page.getByRole('button', { name: 'Write Markdown' }).click();
    await expect(written(page)).toContainText('author: "Ada Lovelace"');
    await expect(written(page)).toContainText('# Interface control document');
    await expect(written(page)).toContainText('Weekly or monthly?');
    await expect(written(page)).toContainText('each report');

    await page.getByLabel('Suggestions in the export').selectOption('rejected');
    await page.getByLabel('Part to export').selectOption('appendix');
    await page.getByRole('checkbox', { name: 'Front matter' }).uncheck();
    await page.getByRole('button', { name: 'Write Markdown' }).click();
    await expect(written(page)).toContainText('Glossary');
    await expect(written(page)).not.toContainText('author: "Ada Lovelace"');
    await expect(written(page)).not.toContainText('Interfaces');

    await page.getByRole('button', { name: 'Write HTML' }).click();
    await expect(written(page)).toContainText('<h1');
  });
});
