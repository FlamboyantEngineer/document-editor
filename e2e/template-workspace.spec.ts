import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const workspace = (page: Page) => page.locator('.de-template-workspace');
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Template actions' });
const nameField = (page: Page) =>
  page.locator('.de-template-workspace__settings').getByRole('textbox', { name: 'Name' });
const preview = (page: Page) => page.getByRole('region', { name: 'Template preview' });

async function rename(page: Page, name: string) {
  await nameField(page).fill(name);
  await nameField(page).press('Enter');
}

async function pick(page: Page, name: string) {
  await toolbar(page)
    .getByRole('button', { name: /Template/ })
    .click();
  await page.getByRole('option', { name: new RegExp(`^${name}`) }).click();
}

test.describe('template workspace lab', () => {
  test('DOCE-TEMPLATE-EDITOR-3.1 DOCE-TEMPLATE-EDITOR-3.2 opens, saves and settles a conflict', async ({
    lab,
    page,
  }) => {
    await lab.open('template-workspace');
    await expect(nameField(page)).toHaveValue('Report');
    await expect(preview(page).locator('.de-document-editor')).toBeVisible();
    const save = toolbar(page).getByRole('button', { name: 'Save', exact: true });
    await expect(save).toBeDisabled();
    await rename(page, 'Annual report');
    await expect(workspace(page)).toHaveAttribute('data-dirty', 'true');
    await save.click();
    await expect(workspace(page)).not.toHaveAttribute('data-dirty', 'true');
    // Another writer saves the template; the next save meets a conflict.
    await page.getByRole('button', { name: 'Save elsewhere' }).click();
    await rename(page, 'Mine');
    await save.click();
    await expect(
      page.getByText('Someone else saved this template since you opened it.'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Reload' }).click();
    await expect(nameField(page)).toHaveValue('Annual report (saved elsewhere)');
    await rename(page, 'Mine');
    await save.click();
    await expect(workspace(page)).not.toHaveAttribute('data-dirty', 'true');
    await expect(nameField(page)).toHaveValue('Mine');
  });

  test('DOCE-TEMPLATE-EDITOR-3.3 DOCE-TEMPLATE-EDITOR-3.5 saves a copy and restores a version', async ({
    lab,
    page,
  }) => {
    await lab.open('template-workspace');
    await toolbar(page).getByRole('button', { name: 'Save as…' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('textbox', { name: 'Id' })).toHaveValue('report-copy');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();
    await expect(nameField(page)).toHaveValue('Copy of Report');
    await pick(page, 'Report');
    await expect(nameField(page)).toHaveValue('Report');
    // The Report template has two saved versions; the older one shows read-only and is restored.
    await toolbar(page).getByRole('button', { name: 'History' }).click();
    const history = page.locator('.de-template-workspace__history');
    await expect(history.getByRole('row')).toHaveCount(2);
    await history.getByRole('row').nth(1).click();
    await expect(page.getByText('Version 1, read only')).toBeVisible();
    await expect(nameField(page)).toBeDisabled();
    await page.getByRole('button', { name: 'Restore this version' }).click();
    await expect(page.getByText('Version 1, read only')).toBeHidden();
    await expect(history.getByRole('row')).toHaveCount(3);
    await expect(nameField(page)).toBeEnabled();
  });

  test('DOCE-TEMPLATE-EDITOR-3.6 DOCE-TEMPLATE-EDITOR-3.7 guards changes and previews a web-layout template', async ({
    lab,
    page,
  }) => {
    await lab.open('template-workspace');
    await rename(page, 'Unsaved');
    await pick(page, 'Article');
    const guard = page.getByRole('alertdialog');
    await expect(guard).toContainText('Changes to Unsaved');
    await guard.getByRole('button', { name: /Stay/ }).click();
    await expect(nameField(page)).toHaveValue('Unsaved');
    await pick(page, 'Article');
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: /Discard/ })
      .click();
    await expect(nameField(page)).toHaveValue('Article');
    await expect(workspace(page)).toHaveAttribute('data-layout', 'web');
    await expect(preview(page).locator('.de-document-editor')).toHaveAttribute(
      'data-layout',
      'web',
    );
  });
});
