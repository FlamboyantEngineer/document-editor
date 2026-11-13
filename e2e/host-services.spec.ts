import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const content = (page: Page) => page.locator('.de-document-editor__content');
const embed = (page: Page) => content(page).locator('.de-embed').first();
const log = (page: Page) => page.getByRole('list', { name: 'Host log' });

test.describe('host services', () => {
  test('DOCE-LABS-3.3 marks embedded data the host changed, removed or denied, and takes its update', async ({
    lab,
    page,
  }) => {
    await lab.open('host-services');
    await expect(embed(page)).toContainText('Supply voltage');
    await expect(embed(page)).not.toHaveAttribute('data-embed-status');

    await page.getByRole('button', { name: 'Change Operating limits at the host' }).click();
    await page.getByRole('button', { name: 'Check embeds with the host' }).click();
    await expect(embed(page)).toHaveAttribute('data-embed-status', 'update');

    await embed(page).locator('td').first().click();
    await page.getByRole('button', { name: "Take the selected embed's update" }).click();
    await expect(page.getByRole('status', { name: 'Embed report' })).toContainText('Update taken');
    await expect(embed(page)).toContainText('Row 3');
    await expect(embed(page)).not.toHaveAttribute('data-embed-status');

    await page.getByRole('button', { name: 'Deny access to Operating limits' }).click();
    await page.getByRole('button', { name: 'Check embeds with the host' }).click();
    await expect(embed(page)).toHaveAttribute('data-embed-status', 'no-access');

    await page.getByRole('button', { name: 'Remove Operating limits at the host' }).click();
    await page.getByRole('button', { name: 'Check embeds with the host' }).click();
    await expect(embed(page)).toHaveAttribute('data-embed-status', 'unavailable');
  });

  test('DOCE-LABS-3.3 shows the host variables in the header again when they change', async ({
    lab,
    page,
  }) => {
    await lab.open('host-services');
    const header = content(page).locator('.pm-page-header').first();
    await expect(header).toContainText('Interface control document · Draft');
    await page.getByLabel('Name in the header').fill('Power budget');
    await page.getByLabel('Status in the header').selectOption('Released');
    await expect(header).toContainText('Power budget · Released');
  });

  test('DOCE-LABS-3.3 asks the host for the template fonts and reports what the editor measured', async ({
    lab,
    page,
  }) => {
    await lab.open('host-services');
    await expect(log(page)).toContainText('fonts: load Arial');
    await expect(log(page)).toContainText('measure:');
  });
});
