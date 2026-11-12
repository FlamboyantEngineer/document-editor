import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const pane = (page: Page, name: string) => page.getByRole('region', { name });
const content = (page: Page, name: string) =>
  pane(page, name).locator('.de-document-editor__content.ProseMirror');
const connection = (page: Page, name: string) => pane(page, name).locator('.de-connection-status');

// Selects a word by double-clicking it in a person's editor.
async function selectWord(page: Page, name: string, word: string) {
  const paragraph = content(page, name).locator('p', { hasText: word });
  const box = await wordBox(paragraph, word);
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
}

// The box of a word's first occurrence in an element's text.
async function wordBox(element: Locator, word: string) {
  const box = await element.evaluate((node, target) => {
    const walker = node.ownerDocument.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      const index = text.textContent?.indexOf(target) ?? -1;
      if (index < 0) continue;
      const range = node.ownerDocument.createRange();
      range.setStart(text, index);
      range.setEnd(text, index + target.length);
      const rect = range.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }
    return null;
  }, word);
  if (!box) throw new Error(`No word ${word}.`);
  return box;
}

async function typeAtEnd(page: Page, name: string, value: string) {
  const paragraph = content(page, name).locator('p', { hasText: 'keeps every change' });
  const box = await paragraph.boundingBox();
  if (!box) throw new Error('The paragraph is not shown.');
  await page.mouse.click(box.x + box.width - 2, box.y + box.height - 4);
  await page.keyboard.type(value);
}

test.describe('presence lab', () => {
  test('DOCE-COLLAB-1.5 shows each caret on the same word in editors of different widths', async ({
    lab,
    page,
  }) => {
    await lab.open('presence');
    await expect(connection(page, 'Ada Lovelace')).toHaveAttribute('data-phase', 'synced');
    await expect(connection(page, 'Grace Hopper')).toHaveAttribute('data-phase', 'synced');
    await selectWord(page, 'Ada Lovelace', 'elsewhere');
    const seenByGrace = pane(page, 'Grace Hopper').locator(
      '.de-presence-selection[data-presence-peer="ada"]',
    );
    await expect(seenByGrace).toHaveText('elsewhere');
    await expect(
      pane(page, 'Grace Hopper').locator('.de-presence-caret[data-presence-peer="ada"]'),
    ).toContainText('Ada Lovelace');
    await selectWord(page, 'Grace Hopper', 'caret');
    await expect(
      pane(page, 'Ada Lovelace').locator('.de-presence-selection[data-presence-peer="grace"]'),
    ).toHaveText('caret');
    // The editors wrap the paragraph differently, so the same word sits elsewhere in each.
    const [wide, narrow] = await Promise.all([
      content(page, 'Ada Lovelace').boundingBox(),
      content(page, 'Grace Hopper').boundingBox(),
    ]);
    expect(narrow?.width ?? 0).toBeLessThan((wide?.width ?? 0) * 0.75);
  });

  test('DOCE-COLLAB-5.2 edits at once from a cached state while offline, and sends on reconnect', async ({
    lab,
    page,
  }) => {
    await lab.open('presence');
    await page.getByLabel('Grace online').uncheck();
    await page.getByRole('button', { name: 'Reopen Grace’s editor' }).click();
    await expect(connection(page, 'Grace Hopper')).toHaveAttribute('data-phase', 'offline');
    await expect(connection(page, 'Grace Hopper')).toHaveAttribute('data-editable', 'true');
    await typeAtEnd(page, 'Grace Hopper', ' Kept offline.');
    await expect(content(page, 'Grace Hopper')).toContainText('Kept offline.');
    await expect(content(page, 'Ada Lovelace')).not.toContainText('Kept offline.');
    await page.getByLabel('Grace online').check();
    await expect(connection(page, 'Grace Hopper')).toHaveAttribute('data-phase', 'synced');
    await expect(content(page, 'Ada Lovelace')).toContainText('Kept offline.');
  });

  test('DOCE-COLLAB-5.2 keeps a fresh editor read-only until its first sync', async ({
    lab,
    page,
  }) => {
    await lab.open('presence');
    await page.getByLabel('Grace online').uncheck();
    await page.getByLabel('Opens').selectOption('fresh');
    const status = connection(page, 'Grace Hopper');
    await expect(status).toHaveAttribute('data-phase', 'offline');
    await expect(status).not.toHaveAttribute('data-editable');
    await expect(content(page, 'Grace Hopper')).toHaveAttribute('contenteditable', 'false');
    await page.getByLabel('Grace online').check();
    await expect(status).toHaveAttribute('data-phase', 'synced');
    await expect(status).toHaveAttribute('data-editable', 'true');
    await expect(content(page, 'Grace Hopper')).toHaveAttribute('contenteditable', 'true');
    // The room's document, once: the fresh editor added nothing of its own.
    await expect(content(page, 'Grace Hopper').getByText('Shared notes')).toHaveCount(1);
    await expect(content(page, 'Ada Lovelace').getByText('Shared notes')).toHaveCount(1);
  });

  test('DOCE-COLLAB-5.1 DOCE-COLLAB-5.3 shows a refused connection and locks the editor', async ({
    lab,
    page,
  }) => {
    await lab.open('presence');
    await page.getByLabel('Access').selectOption('refused');
    const status = connection(page, 'Grace Hopper');
    await expect(status).toHaveAttribute('data-phase', 'refused');
    await expect(status).toHaveAttribute('data-locked', 'true');
    await expect(status).toHaveText('Access refused');
    await expect(content(page, 'Grace Hopper')).toHaveAttribute('contenteditable', 'false');
  });

  test('DOCE-COLLAB-5.1 DOCE-COLLAB-5.3 locks every editor when the room holds another generation', async ({
    lab,
    page,
  }) => {
    await lab.open('presence');
    await expect(connection(page, 'Ada Lovelace')).toHaveAttribute('data-phase', 'synced');
    await page.getByRole('button', { name: 'Replace the room' }).click();
    for (const name of ['Ada Lovelace', 'Grace Hopper']) {
      const status = connection(page, name);
      await expect(status).toHaveAttribute('data-phase', 'generation-mismatch');
      await expect(status).toHaveAttribute('data-locked', 'true');
      await expect(content(page, name)).toHaveAttribute('contenteditable', 'false');
    }
  });
});
