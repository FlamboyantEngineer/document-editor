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
    const avatars = page
      .getByRole('group', { name: 'Document status' })
      .locator('.de-document-editor__presence');
    await expect(avatars).toBeVisible();
    await page.getByLabel('Collaborators').uncheck();
    await expect(carets).toHaveCount(0);
    await expect(avatars).toHaveCount(0);
  });
});
