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

  test('DOCE-AUTOMATION-3.5 DOCE-AUTOMATION-3.9 attributes a taken completion to the agent, and turns off from the toolbar', async ({
    lab,
    page,
  }) => {
    await lab.open('full-editor');
    await content(page).locator('h1', { hasText: 'Power' }).click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Recovery takes');
    await expect(content(page).locator('.de-inline-completion')).toHaveCount(1);
    await page.keyboard.press('Tab');
    await expect(
      content(page).locator('span[data-ai="lab-completion"]', {
        hasText: 'less than one second.',
      }),
    ).toHaveCount(1);
    const toggle = page
      .getByRole('toolbar', { name: 'Formatting' })
      .locator('[data-item="inline-completion"]');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await content(page).locator('p', { hasText: 'Recovery takes less' }).click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Recovery takes');
    await page.waitForTimeout(600);
    await expect(content(page).locator('.de-inline-completion')).toHaveCount(0);
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

  test('DOCE-EDITOR-6.1 tells the host a comment is a review change, not a suggestion', async ({
    lab,
    page,
  }) => {
    await lab.open('full-editor');
    const report = page.locator('output[aria-label="Host report"]');
    await expect(report).toContainText('blocks measured');
    await expect(report).not.toContainText('review changes');
    await page.getByLabel('Suggesting').check();
    await page.getByRole('button', { name: 'Comment on a sentence' }).click();
    await expect(page.locator('output[aria-label="Agent report"]')).toContainText('Commented on');
    await expect(report).toContainText('1 review changes');
    await expect(report).toContainText('1 suggestions');
    // A thread started in the margin is a review change too.
    await content(page).locator('h1', { hasText: 'Timing' }).click();
    await page.keyboard.press('ControlOrMeta+Alt+m');
    const composer = margin(page).getByRole('textbox', { name: 'Add a comment' });
    await expect(composer).toBeFocused();
    await page.keyboard.type('Which timing?');
    await margin(page)
      .getByRole('group', { name: 'Comment thread' })
      .filter({ has: page.getByRole('textbox', { name: 'Add a comment' }) })
      .getByRole('button', { name: 'Comment' })
      .click();
    await expect(content(page).locator('h1 mark[data-comment-id]')).toHaveText('Timing');
    await expect(report).toContainText('2 review changes');
    await expect(report).toContainText('1 suggestions');
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
    const blocks = content(page).locator('.script-block');
    const status = blocks.first();
    await expect(status.locator('.script-output')).toContainText(/^Status: \d+ blocks\.$/);
    // The writer cannot edit the output.
    await status.locator('.script-output p').click();
    await page.keyboard.type('xyz');
    await expect(status).not.toContainText('xyz');
    // A script inserted from the toolbar runs at once.
    await content(page).locator('h1', { hasText: 'Timing' }).click();
    await page.getByRole('toolbar', { name: 'Formatting' }).locator('[data-item="script"]').click();
    const dialog = page.getByRole('dialog');
    const source = dialog.getByRole('textbox', { name: 'Script' });
    await source.fill('render.paragraph("Summary: ${document.blocks} blocks.")');
    await dialog.getByRole('button', { name: 'Apply and run' }).click();
    const summary = content(page).locator('.script-block', { hasText: 'Summary:' });
    await expect(summary.locator('.script-output')).toContainText(/^Summary: \d+ blocks\.$/);
    // The context menu edits a script; a problem the host's check finds keeps it from applying.
    await summary.locator('.script-output p').click({ button: 'right' });
    await page.getByRole('menu').last().getByRole('menuitem', { name: 'Edit script…' }).click();
    await source.fill('render.table()');
    await expect(dialog.getByText(/Not a statement the lab knows/).first()).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Apply and run' })).toBeDisabled();
  });

  test('DOCE-EDITOR-4.9 previews, completes and documents a script in its editor', async ({
    lab,
    page,
  }) => {
    await lab.open('full-editor');
    await content(page).locator('h1', { hasText: 'Timing' }).click();
    await page.getByRole('toolbar', { name: 'Formatting' }).locator('[data-item="script"]').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const source = dialog.getByRole('textbox', { name: 'Script' });
    // The names after an object's dot complete.
    await source.fill('render.');
    await source.press('End');
    await page.keyboard.press('Control+Space');
    await expect(page.getByRole('option', { name: /paragraph/ }).first()).toBeVisible();
    await page.keyboard.press('Escape');
    // The preview runs the script on asking, without changing the document.
    await source.fill('render.heading("Preview heading", 2)');
    await expect(dialog.getByText('Refresh the preview to run the script.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Refresh preview' }).click();
    await expect(dialog.locator('h2', { hasText: 'Preview heading' })).toBeVisible();
    // The document's own content comes first; the preview's is in the dialog.
    await expect(content(page).first().locator('h2', { hasText: 'Preview heading' })).toHaveCount(
      0,
    );
    // The reference lists the names a script can use, by object.
    await dialog.getByRole('tab', { name: 'Reference' }).click();
    await expect(dialog.getByText('render.heading(text, level)')).toBeVisible();
    await dialog.getByRole('searchbox', { name: 'Filter the reference' }).fill('blocks');
    await expect(dialog.getByText('render.heading(text, level)')).toBeHidden();
    await expect(dialog.getByText('How many blocks the document holds.')).toBeVisible();
  });

  test('DOCE-EDITOR-4.10 offers the editor commands and the host File menu in a menubar', async ({
    lab,
    page,
  }) => {
    await lab.open('full-editor');
    const menubar = page.getByRole('menubar', { name: 'Menu' });
    await expect(menubar.getByRole('menuitem')).toHaveText([
      'File',
      'Edit',
      'View',
      'Insert',
      'Format',
      'Tools',
    ]);
    // Format runs the toolbar's commands.
    await content(page).locator('h1', { hasText: 'Timing' }).click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Bold words');
    await page.keyboard.press('Shift+Home');
    await menubar.getByRole('menuitem', { name: 'Format' }).click();
    await page.getByRole('menuitem', { name: 'Bold' }).click();
    await expect(content(page).locator('strong', { hasText: 'Bold words' })).toHaveCount(1);
    // View switches the layout; the host's File menu saves.
    await menubar.getByRole('menuitem', { name: 'View' }).click();
    await page.getByRole('menuitem', { name: 'Zoom in' }).click();
    await expect(page.locator('.de-document-editor__zoom')).toContainText('110');
    await menubar.getByRole('menuitem', { name: 'File' }).click();
    await page.getByRole('menuitem', { name: 'Save' }).click();
    await expect(page.getByRole('status', { name: 'Host feedback' })).toHaveText('Saved');
  });

  test('DOCE-EDITOR-4.12 DOCE-EDITOR-4.4 switches the editing mode and the markup', async ({
    lab,
    page,
  }) => {
    await lab.open('full-editor');
    const root = page.locator('.de-document-editor');
    const toolbar = page.getByRole('toolbar', { name: 'Formatting' });
    await toolbar.locator('[data-item="mode"]').click();
    await page.getByRole('menuitemcheckbox', { name: 'Suggesting' }).click();
    await expect(root).toHaveAttribute('data-suggesting', 'true');
    await expect(page.getByLabel('Suggesting')).toBeChecked();
    await toolbar.locator('[data-item="mode"]').click();
    await page.getByRole('menuitemcheckbox', { name: 'Reading' }).click();
    await expect(root).toHaveAttribute('data-mode', 'reading');
    await toolbar.locator('[data-item="mode"]').click();
    await page.getByRole('menuitemcheckbox', { name: 'Editing' }).click();
    await expect(root).toHaveAttribute('data-mode', 'authoring');
    // A mode the host does not offer now is disabled, saying why.
    await page.getByLabel('Restrict editing').check();
    await toolbar.locator('[data-item="mode"]').click();
    await page.getByRole('menuitemcheckbox', { name: 'Suggesting' }).click();
    await toolbar.locator('[data-item="mode"]').click();
    const editing = page.getByRole('menuitemcheckbox', { name: /Editing/ });
    await expect(editing).toBeDisabled();
    await expect(editing).toContainText('The host lets this writer only suggest');
    await page.keyboard.press('Escape');
    // The markup control, from no markup to inline.
    await toolbar.locator('[data-item="markup"]').click();
    await page.getByRole('menuitemcheckbox', { name: 'Change bars' }).click();
    await expect(root).toHaveAttribute('data-markup', 'simple');
    const menubar = page.getByRole('menubar', { name: 'Menu' });
    await menubar.getByRole('menuitem', { name: 'View' }).click();
    await page.getByRole('menuitem', { name: 'Markup' }).click();
    await page.getByRole('menuitemcheckbox', { name: 'No markup' }).click();
    await expect(root).toHaveAttribute('data-markup', 'final');
  });

  test('DOCE-EDITOR-4.13 DOCE-EDITOR-4.14 lays out columns and says why a control is off', async ({
    lab,
    page,
  }) => {
    await lab.open('full-editor');
    const toolbar = page.getByRole('toolbar', { name: 'Formatting' });
    await content(page).locator('h1', { hasText: 'Timing' }).click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await toolbar.getByRole('button', { name: 'Layout' }).click();
    await page.getByRole('menuitemcheckbox', { name: 'Three columns' }).click();
    await expect(content(page).locator('[data-layout-preset="thirds"]')).toHaveCount(1);
    await toolbar.getByRole('button', { name: 'Layout' }).click();
    await page.getByRole('menuitem', { name: 'Remove the layout section' }).click();
    await expect(content(page).locator('[data-layout-preset="thirds"]')).toHaveCount(0);
    // While the document is read, a control stays focusable and says why it is off.
    await toolbar.locator('[data-item="mode"]').click();
    await page.getByRole('menuitemcheckbox', { name: 'Reading' }).click();
    const bold = toolbar.getByRole('button', { name: 'Bold' });
    await expect(bold).toBeDisabled();
    await bold.hover();
    await expect(page.getByRole('tooltip')).toContainText('The document is open for reading');
  });

  test('DOCE-EDITOR-4.15 DOCE-EDITOR-4.16 scrolls the toolbar and opens the host dialogs', async ({
    lab,
    page,
  }) => {
    await lab.open('full-editor');
    await expect(page.locator('.de-document-editor__toolbar')).toHaveAttribute(
      'data-overflow',
      'scroll',
    );
    await content(page).locator('h1', { hasText: 'Timing' }).click();
    await page.keyboard.press('End');
    await page.getByRole('button', { name: 'Insert note' }).click();
    const dialog = page.getByRole('dialog', { name: 'Note' });
    await expect(dialog.getByRole('textbox', { name: 'Note' })).toHaveValue('Check');
    await dialog.getByRole('button', { name: 'Insert' }).click();
    await expect(content(page).locator('h1', { hasText: 'Note: Check' })).toHaveCount(1);
    await expect(content(page)).toBeFocused();
  });

  test('DOCE-COMMENTS-3.5 keeps each card beside its own page, portrait or landscape', async ({
    lab,
    page,
  }) => {
    await lab.open('full-editor');
    // The gap between a thread's page and its card, once both are in view.
    const gap = async (quote: string) => {
      const mark = content(page).locator('mark[data-comment-id]', { hasText: quote });
      await mark.scrollIntoViewIfNeeded();
      const card = margin(page)
        .locator(':scope > [role="listitem"]')
        .filter({ hasText: quote })
        .locator('.de-document-comments__card');
      await expect(card).toBeVisible();
      const edge = await mark.evaluate(
        (element) => element.closest('.pm-page')?.getBoundingClientRect().right ?? 0,
      );
      return { edge, start: (await card.boundingBox())?.x ?? 0 };
    };
    await expect
      .poll(async () => {
        const { edge, start } = await gap('landscape pages');
        return Math.round(start - edge);
      })
      .toBe(16);
    const landscape = await gap('landscape pages');
    await expect
      .poll(async () => {
        const { edge, start } = await gap('portrait pages again');
        return Math.round(start - edge);
      })
      .toBe(16);
    const portrait = await gap('portrait pages again');
    expect(landscape.edge - portrait.edge).toBeGreaterThan(100);
    // Markers instead of cards, each opening its card.
    await page.getByLabel('Comment markers').check();
    const markers = margin(page).getByRole('button', { name: /annotation|comment|\d/i });
    await expect(markers.first()).toBeVisible();
    await expect(margin(page).getByText('This card sits beside the landscape page')).toHaveCount(0);
  });
});
