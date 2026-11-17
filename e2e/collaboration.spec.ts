import { expect, test } from './fixtures.js';

test.describe('collaboration', () => {
  test('DOCE-COLLAB-1.1 DOCE-COLLAB-1.3 shows the other people’s carets, selections and avatars', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    await expect(page.locator('.de-presence-caret')).toHaveCount(0);
    await page.getByLabel('Collaborators').check();
    const carets = page.locator('.de-document-editor__content .de-presence-caret');
    await expect(carets).toHaveCount(2);
    await expect(carets.locator('.de-presence-caret__label')).toHaveText([
      'Grace Hopper',
      'Alan Turing',
    ]);
    await expect(
      page.locator('.de-presence-selection[data-presence-peer="grace"]').first(),
    ).toBeAttached();
    // The avatars sit in the toolbar, just before the editing mode, the idle person faded.
    const avatars = page.locator(
      '[data-group="mode"] [data-item="presence"] .de-document-editor__presence',
    );
    await expect(avatars).toBeVisible();
    await expect(avatars.locator('[data-status="idle"]').first()).toHaveCSS('opacity', '0.55');
    // Hovering an avatar opens the person's card; hovering a selection names its person.
    await avatars.getByRole('button', { name: /Grace Hopper/ }).hover();
    const card = page.locator('.de-document-editor__presence-card');
    await expect(card).toContainText('grace@example.com');
    await expect(card.locator('[data-presence-activity]')).toHaveText('Editing');
    // The lab's collaborators move every 1.5 seconds, which can take the selection from under the
    // pointer between hovering it and reading its label: hover it again until the label is read.
    const selection = page.locator('.de-presence-selection[data-presence-peer="grace"]').first();
    await expect
      .poll(async () => {
        await selection.hover();
        return selection.evaluate((node) => getComputedStyle(node, '::after').content);
      })
      .toBe('"Grace Hopper"');
    await page.getByLabel('Collaborators').uncheck();
    await expect(carets).toHaveCount(0);
    await expect(avatars).toHaveCount(0);
  });
});
