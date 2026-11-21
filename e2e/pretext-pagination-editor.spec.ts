import { expect, test } from './fixtures.js';

test('DOCE-LABS-5.4 opens every stress fixture for editing, including unsupported preview content', async ({
  lab,
  page,
}) => {
  test.setTimeout(120_000);
  await lab.open('pretext-pagination');
  const picker = page.getByLabel('Document', { exact: true });
  const workloads = await picker
    .locator('option')
    .evaluateAll((options) =>
      options
        .map((option) => (option as HTMLOptionElement).value)
        .filter((value) => value.startsWith('stress-') || value === 'unsupported'),
    );
  expect(workloads).toContain('stress-pagination');
  for (const name of workloads) {
    await picker.selectOption(name);
    // The largest stress fixtures take about 6 s to lay out on an idle machine, so under a full
    // parallel run they need longer than the default wait.
    await expect(page.locator('html')).toHaveAttribute('data-lab-ready', 'true', {
      timeout: 40_000,
    });
    const editor = page.locator('#pretext-editor .de-document-editor');
    await expect(editor).toHaveAttribute('data-layout-state', 'settled');
    const block = editor
      .locator('.de-document-editor__content .pm-page-content :is(p,h1,h2,h3)')
      .first();
    await block.click();
    await page.keyboard.press('Home');
    const text = `Edited ${name} `;
    await page.keyboard.insertText(text);
    await expect(block, name).toContainText(text.trim());
    await page.keyboard.press('ControlOrMeta+z');
    await expect(block).not.toContainText(text.trim());
  }
});

test('DOCE-LABS-5.4 reviews a draft in the context menu, previews its markup and returns to decide it', async ({
  lab,
  page,
}) => {
  await lab.open('pretext-pagination');
  const picker = page.getByLabel('Document', { exact: true });
  const view = page.getByRole('combobox', { name: 'View', exact: true });
  const content = page.locator('#pretext-editor .de-document-editor__content');
  const block = content.locator('.pm-page-content p').first();
  await block.click({ button: 'right' });
  await page.getByRole('menuitem', { name: /^Comment\b/ }).click();
  const margin = page.getByRole('list', { name: 'Comments' });
  const compose = margin.getByRole('textbox', { name: 'Add a comment' });
  await compose.fill('Check the wording');
  await margin.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(margin).toContainText('Check the wording');
  await page.getByRole('toolbar', { name: 'Formatting' }).locator('[data-item="mode"]').click();
  await page.getByRole('menuitemcheckbox', { name: 'Suggesting' }).click();
  await block.click();
  await page.keyboard.press('Home');
  await page.keyboard.insertText('Review this ');
  await expect(block.locator('ins')).toContainText('Review this');
  const id = await block.getAttribute('data-id');
  expect(id).toBeTruthy();

  await view.selectOption('preview');
  await expect(page.locator('#pretext-editor')).toBeEmpty();
  const preview = page.getByRole('region', { name: 'Document pages' });
  const previewBlock = preview.locator(`[data-id="${String(id)}"]`);
  await expect(previewBlock.locator('ins')).toHaveText('Review this ');
  await expect(previewBlock.locator('mark[data-comment-id]').first()).toBeAttached();
  await page.getByRole('button', { name: 'Check HTML parity' }).click();
  await expect(page.locator('#pretext-report')).toContainText('"differences": []');
  await expect(page.locator('#pretext-report')).toContainText('"pageDifferences": []');
  await picker.selectOption('short');
  await view.selectOption('editor');
  await expect(content).not.toContainText('Review this');
  await picker.selectOption('examples');
  await expect(margin).toContainText('Check the wording');
  await expect(block.locator('ins')).toHaveText('Review this ');
  await margin.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(block.locator('ins')).toHaveCount(0);
  await expect(block).toContainText('Review this');
});
