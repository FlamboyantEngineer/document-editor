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

  test('DOCE-EMBEDS-2.3 DOCE-EMBEDS-3.2 resizes a column of an embedded table and keeps it through an update', async ({
    lab,
    page,
  }) => {
    await lab.open('host-services');
    const first = embed(page).locator('td, th').first();
    await first.scrollIntoViewIfNeeded();
    const box = await first.boundingBox();
    if (!box) throw new Error('The table is not drawn');
    const border = { x: box.x + box.width - 1, y: box.y + box.height / 2 };
    await page.mouse.move(border.x - 10, border.y);
    await page.mouse.move(border.x, border.y, { steps: 3 });
    await page.mouse.down();
    await page.mouse.move(border.x - 60, border.y, { steps: 6 });
    await page.mouse.up();
    await expect(first).toHaveAttribute('data-colwidth', /^\d+$/);
    const width = await first.getAttribute('data-colwidth');
    // No entry changes the rows and columns the host keeps.
    await embed(page).locator('td').first().click({ button: 'right' });
    await expect(page.getByRole('menuitem', { name: 'Align cells' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Insert row' })).toHaveCount(0);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Change Operating limits at the host' }).click();
    await page.getByRole('button', { name: 'Check embeds with the host' }).click();
    await expect(embed(page)).toHaveAttribute('data-embed-status', 'update');
    await embed(page).locator('td').first().click();
    await page.getByRole('button', { name: "Take the selected embed's update" }).click();
    await expect(embed(page)).toContainText('Row 3');
    await expect(embed(page).locator('td, th').first()).toHaveAttribute(
      'data-colwidth',
      width ?? '',
    );
  });

  test('DOCE-EMBEDS-1.4 DOCE-TEMPLATES-5.4 draws embedded content in the styles of the text and section around it', async ({
    lab,
    page,
  }) => {
    await lab.open('host-services');
    const tables = content(page).locator('.de-embed table');
    await expect(tables).toHaveCount(2);
    // Each embedded table takes its section's table colors, and carries none of its own.
    const look = (index: number) =>
      tables
        .nth(index)
        .locator('th, td')
        .first()
        .evaluate((cell) => {
          const style = getComputedStyle(cell);
          return {
            background: style.backgroundColor,
            color: style.color,
            border: style.borderTopColor,
            own: cell.closest('.de-embed')?.querySelector('[style*="color"]') !== null,
          };
        });
    await expect
      .poll(() => look(0))
      .toEqual({
        background: 'rgb(226, 232, 240)',
        color: 'rgb(15, 23, 42)',
        border: 'rgb(51, 65, 85)',
        own: false,
      });
    await expect
      .poll(() => look(1))
      .toEqual({
        background: 'rgb(254, 243, 199)',
        color: 'rgb(120, 53, 15)',
        border: 'rgb(180, 83, 9)',
        own: false,
      });
    // An inline embed in a heading reads as the heading's text.
    const inline = content(page).locator('h1 .de-embed-inline');
    await expect(inline).toHaveText('28 V');
    const font = (selector: string) =>
      content(page)
        .locator(selector)
        .first()
        .evaluate((element) => {
          const style = getComputedStyle(element);
          return [style.fontSize, style.fontWeight, style.fontFamily].join(' ');
        });
    expect(await font('h1 .de-embed-inline')).toBe(await font('h1:has(.de-embed-inline)'));
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

  test('DOCE-LABS-3.3 DOCE-EMBEDS-3.4 pins an embed to the state it shows, and repins it from the context menu', async ({
    lab,
    page,
  }) => {
    await lab.open('host-services');
    await embed(page).locator('td').first().click();
    await page.getByRole('button', { name: 'Pin the selected embed' }).click();
    await expect(embed(page)).toHaveAttribute('data-embed-pinned', 'true');
    await expect(page.getByRole('status', { name: 'Embed report' })).toContainText('pinned');

    // A pinned embed still says the host has another state.
    await page.getByRole('button', { name: 'Change Operating limits at the host' }).click();
    await page.getByRole('button', { name: 'Check embeds with the host' }).click();
    await expect(embed(page)).toHaveAttribute('data-embed-status', 'update');
    await embed(page).locator('td').first().click({ button: 'right' });
    await page.getByRole('menuitem', { name: "Repin at the host's content" }).click();
    await expect(embed(page)).toContainText('Row 3');
    await expect(embed(page)).toHaveAttribute('data-embed-pinned', 'true');
    await expect(embed(page)).not.toHaveAttribute('data-embed-status');

    await embed(page).locator('td').first().click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Let this embed follow its content' }).click();
    await expect(embed(page)).not.toHaveAttribute('data-embed-pinned');
    await embed(page).locator('td').first().click({ button: 'right' });
    await expect(page.getByRole('menuitem', { name: 'Pin this embed at its state' })).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('DOCE-LABS-3.3 DOCE-EMBEDS-1.3 embeds a linked spreadsheet range and takes its recalculated update', async ({
    lab,
    page,
  }) => {
    await lab.open('host-services');
    await content(page).locator('p').first().click();
    await page.getByRole('button', { name: 'Insert the budget range' }).click();
    const sheet = content(page).locator('.de-embed', { hasText: 'Cabling' });
    await expect(sheet).toContainText('1540');
    await expect(sheet.locator('th, td').first()).toHaveText('Item');

    await page.getByRole('button', { name: 'Change the cabling cost at the host' }).click();
    await page.getByRole('button', { name: 'Check embeds with the host' }).click();
    await expect(sheet).toHaveAttribute('data-embed-status', 'update');
    await page.getByRole('button', { name: 'Recalculate at the host' }).click();
    await expect(page.getByRole('button', { name: 'Insert the budget range' })).toBeDisabled();
    await page.getByRole('button', { name: 'Finish recalculating' }).click();
    await sheet.locator('td').first().click();
    await page.getByRole('button', { name: "Take the selected embed's update" }).click();
    await expect(sheet).toContainText('1560');
    await expect(sheet).not.toHaveAttribute('data-embed-status');

    await page.getByRole('button', { name: 'Deny access to the budget' }).click();
    await page.getByRole('button', { name: 'Check embeds with the host' }).click();
    await expect(sheet).toHaveAttribute('data-embed-status', 'no-access');
  });

  test('DOCE-LABS-3.3 DOCE-PAGINATION-5.6 DOCE-EDITOR-4.29 DOCE-EDITOR-7.3 shows the pages without waiting for the host fonts, and only warns of fonts that do not load', async ({
    lab,
    page,
  }) => {
    await lab.open('host-services');
    await page.getByLabel('Font timeout').selectOption('1000');
    await page.getByRole('combobox', { name: /^Fonts/ }).selectOption('late');
    // Opened again, the editor asks the host for the fonts but shows the pages before they come.
    await page.getByRole('button', { name: 'Open the editor again' }).click();
    await expect(log(page)).toContainText('(timeout 1000 ms)');
    await expect(page.locator('.de-document-editor__body')).not.toHaveAttribute('inert');
    await expect(page.locator('.pm-page').first()).toBeVisible();
    // The host gives up on them a second later: a warning, never the layout error.
    await expect(page.getByText(/in a fallback font/u)).toBeVisible();
    await expect(page.locator('.de-document-editor__layout-error')).toHaveCount(0);
  });

  test('DOCE-LABS-3.3 DOCE-PAGINATION-10.8 shows math invalid with the host reason when the typesetter stops answering', async ({
    lab,
    page,
  }) => {
    await lab.open('host-services');
    await content(page).locator('p').first().click();
    await page.keyboard.press('End');
    await page.getByRole('button', { name: 'Insert math' }).click();
    const typeset = content(page).locator('.de-math').last();
    await expect(typeset).toHaveAttribute('data-state', 'ready');

    await page.getByLabel('The typesetter answers').uncheck();
    await content(page).locator('p').first().click();
    await page.keyboard.press('End');
    await page.getByRole('button', { name: 'Insert math' }).click();
    const waiting = content(page).locator('.de-math[data-state]:not([data-state="ready"])');
    await expect(waiting).toHaveAttribute('data-state', 'invalid', { timeout: 8000 });
    await expect(waiting).toHaveAttribute('title', 'The lab typesetter did not answer (3 s)');
  });
});
