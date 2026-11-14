import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const content = (page: Page) => page.locator('.de-document-editor__content');
const report = (page: Page) => page.getByRole('status', { name: 'Agent report' });

test.describe('automation', () => {
  test('DOCE-AUTOMATION-2.1 an agent suggests a rewrite on the live document', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    await page.getByRole('button', { name: 'Rewrite a phrase' }).click();
    await expect(report(page)).toHaveText('Applied 1 edit(s)');
    const inserted = content(page).locator('ins', { hasText: 'operating state' });
    await expect(inserted).toHaveCount(1);
    await expect(content(page).locator('del', { hasText: 'condition' }).first()).toBeVisible();
    // The writer undoes the agent's change as one step.
    await content(page).click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('ControlOrMeta+z');
    await expect(inserted).toHaveCount(0);
  });

  test('DOCE-AUTOMATION-2.1 an agent edits directly and comments by element id', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    await page.getByLabel('Agent suggests').uncheck();
    await page.getByRole('button', { name: 'Rewrite a phrase' }).click();
    await expect(content(page)).toContainText('operating state');
    await expect(content(page).locator('ins', { hasText: 'operating state' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Comment on a sentence' }).click();
    await expect(report(page)).toHaveText(/^Commented on "/);
    await expect(content(page).locator('mark[data-comment-id]')).toHaveCount(1);
  });

  test('DOCE-AUTOMATION-5.2 a provider shortens the selected text as the agent’s suggestion', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    const paragraph = content(page).locator('p', { hasText: 'condition' }).first();
    await paragraph.click();
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');
    await page.getByRole('button', { name: 'Shorten the selection' }).click();
    await expect(report(page)).toHaveText('Shortened the selection');
    await expect(content(page).locator('ins', { hasText: '…' })).toHaveCount(1);
  });

  test('DOCE-AUTOMATION-2.2 an agent streams a note piece by piece as one suggestion', async ({
    lab,
    page,
  }) => {
    await lab.open('document-editor');
    await page.getByRole('button', { name: 'Stream a note' }).click();
    await expect(report(page)).toHaveText('Streamed a note');
    // The pieces make one suggestion: their marks share its id and spell the note. The pages are
    // drawn after the report, so the last piece may land a frame later.
    await expect(async () => {
      const pieces = await content(page)
        .locator('ins')
        .evaluateAll((all) =>
          all.map((each) => [each.getAttribute('data-id'), each.textContent ?? '']),
        );
      expect(new Set(pieces.map(([id]) => id)).size).toBe(1);
      expect(pieces.map(([, text]) => text).join('')).toContain(
        'The agent writes this note piece by piece.',
      );
    }).toPass();
  });
});
