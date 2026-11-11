import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const content = (page: Page) => page.locator('.de-document-editor__content');
const margin = (page: Page) => page.getByRole('list', { name: 'Comments' });

test.describe('full editor lab', () => {
  test('DOCE-LABS-3.2 brings comments, suggestions, proofing, find and the host together', async ({
    lab,
    page,
  }) => {
    await lab.open('full-editor');
    // The comment thread in the margin, and the suggestion in the text.
    await expect(margin(page)).toContainText('Does normal operation include start-up?');
    await expect(content(page).locator('ins', { hasText: 'each' })).toHaveCount(1);
    // The two proofers' issues, counted in the status bar.
    await expect(page.locator('.de-document-editor__proofing-status')).toHaveText('3 issues');
    // Suggesting turns typing into a suggestion by the writer.
    await page.getByLabel('Suggesting').check();
    await content(page).locator('h1', { hasText: 'Timing' }).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' plan');
    await expect(content(page).locator('h1 ins', { hasText: 'plan' })).toHaveCount(1);
    // Find in the document.
    await page.keyboard.press('ControlOrMeta+f');
    await page
      .getByRole('searchbox', { name: 'Find in document' })
      .or(page.getByRole('textbox', { name: 'Find in document' }))
      .fill('Maintenance');
    await expect
      .poll(() => content(page).locator('[data-search-match]').count())
      .toBeGreaterThan(0);
    // The host's own toolbar item and the agent.
    await expect(
      page.getByRole('toolbar', { name: 'Formatting' }).locator('[data-item="insert-date"]'),
    ).toHaveCount(1);
    await page.getByRole('button', { name: 'Rewrite a phrase' }).click();
    await expect(content(page).locator('ins', { hasText: 'operating state' })).toHaveCount(1);
  });

  test('DOCE-EDITOR-6.9 exports a snapshot of the pages for printing', async ({ lab, page }) => {
    await lab.open('full-editor');
    const pages = await content(page).locator('.pm-page').count();
    await page.getByRole('button', { name: 'Export a snapshot' }).click();
    await expect(
      page
        .getByRole('status', { name: 'Snapshot' })
        .or(page.locator('output[aria-label="Snapshot"]')),
    ).toHaveText(`${String(pages)} pages`);
  });

  test('DOCE-AUTOMATION-3.3 offers the provider completion after a pause, taken with Tab', async ({
    lab,
    page,
  }) => {
    await lab.open('full-editor');
    await content(page).locator('h1', { hasText: 'Power' }).click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Recovery takes');
    await expect(content(page).locator('.de-inline-completion')).toHaveText(
      ' less than one second.',
    );
    await page.keyboard.press('Tab');
    await expect(content(page).locator('.de-inline-completion')).toHaveCount(0);
    await expect(
      content(page).locator('p', { hasText: 'Recovery takes less than one second.' }),
    ).toHaveCount(1);
  });

  test('DOCE-FORMAT-6.2 pastes word processor lists as lists', async ({ lab, page }) => {
    await lab.open('full-editor');
    await content(page).locator('h1', { hasText: 'Power' }).click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    const html = [
      '<html xmlns:o="urn:schemas-microsoft-com:office:office"><body>',
      '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1"><![if !supportLists]><span style="mso-list:Ignore">1.<span> </span></span><![endif]>Charge<o:p></o:p></p>',
      '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1"><![if !supportLists]><span style="mso-list:Ignore">2.<span> </span></span><![endif]>Discharge<o:p></o:p></p>',
      '</body></html>',
    ].join('');
    await content(page).evaluate((element, markup) => {
      const data = new DataTransfer();
      data.setData('text/html', markup);
      data.setData('text/plain', 'Charge Discharge');
      const target = element.querySelector('[contenteditable="true"]') ?? element;
      target.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      );
    }, html);
    const list = content(page).locator('ol', { hasText: 'Discharge' });
    await expect(list.locator('li')).toHaveCount(2);
    await expect(content(page)).not.toContainText('mso');
  });

  test('DOCE-EDITOR-6.10 tells the host the suggestions as they change', async ({ lab, page }) => {
    await lab.open('full-editor');
    const report = page.locator('output[aria-label="Host report"]');
    await expect(report).toContainText('1 suggestions');
    await page.getByLabel('Suggesting').check();
    await content(page).locator('h1', { hasText: 'Timing' }).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' plan');
    await expect(report).toContainText('2 suggestions');
  });

  test('DOCE-COLLAB-3.2 shows who wrote what while asked', async ({ lab, page }) => {
    await lab.open('full-editor');
    await content(page).locator('h1', { hasText: 'Power' }).click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Written by Ada');
    const written = content(page).locator('p', { hasText: 'Written by Ada' });
    await expect(written.locator('[data-author-slot]')).toHaveCount(0);
    await page.getByLabel('Authorship').check();
    await expect(page.locator('.de-document-editor')).toHaveAttribute('data-authorship', 'true');
    await expect(written.locator('[data-author="ada"]')).toHaveCount(1);
    await page.getByLabel('Authorship').uncheck();
    await expect(written.locator('[data-author-slot]')).toHaveCount(0);
  });

  test('DOCE-EDITOR-4.8 DOCE-OBJECTS-4.3 runs the host scripts into their blocks', async ({
    lab,
    page,
  }) => {
    await lab.open('full-editor');
    // The script that runs on opening shows what it produced.
    const status = content(page).locator('.script-block[data-script="Status"]');
    await expect(status.locator('.script-output')).toContainText(/^Status: \d+ blocks\.$/);
    // The writer cannot edit the output.
    await status.locator('.script-output p').click();
    await page.keyboard.type('xyz');
    await expect(status).not.toContainText('xyz');
    // A script inserted from the toolbar runs at once.
    await content(page).locator('h1', { hasText: 'Timing' }).click();
    await page.getByRole('toolbar', { name: 'Formatting' }).locator('[data-item="script"]').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'Script' }).fill('Summary');
    await dialog.getByRole('button', { name: 'Apply and run' }).click();
    const summary = content(page).locator('.script-block[data-script="Summary"]');
    await expect(summary.locator('.script-output')).toContainText(/^Summary: \d+ blocks\.$/);
    // The context menu edits a script, and a failing one is marked.
    await summary.locator('.script-output p').click({ button: 'right' });
    await page.getByRole('menu').last().getByRole('menuitem', { name: 'Edit script…' }).click();
    await dialog.getByRole('textbox', { name: 'Script' }).fill('Summary fail');
    await dialog.getByRole('button', { name: 'Apply and run' }).click();
    await expect(
      content(page).locator('.script-block[data-script="Summary fail"]'),
    ).toHaveAttribute('data-script-state', 'error');
  });
});
