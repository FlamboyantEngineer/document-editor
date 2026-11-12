import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const status = (page: Page, name: string) => page.getByLabel(`${name}'s status`);
const editor = (page: Page, name: string) =>
  page.getByRole('textbox', { name: `${name}'s document` });
const pane = (page: Page, name: string) => page.getByRole('region', { name });

// Types at the end of a heading in a writer's document, placing the caret by clicking past its text.
async function typeAfter(page: Page, name: string, heading: string, value: string) {
  const target = editor(page, name).getByRole('heading', { name: heading, exact: true });
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error(`The heading ${heading} is not shown.`);
  await page.mouse.click(box.x + box.width - 2, box.y + box.height / 2);
  await page.keyboard.type(value);
}

// Both writers hold the same document: the same text, page for page.
async function expectSameDocument(page: Page) {
  await expect(async () => {
    const [ada, grace] = await Promise.all([
      editor(page, 'Ada').textContent(),
      editor(page, 'Grace').textContent(),
    ]);
    expect(ada).toBe(grace);
  }).toPass();
}

async function openLab(lab: { open(name: string): Promise<void> }, page: Page) {
  await lab.open('collab-room');
  await expect(status(page, 'Ada')).toHaveText(/^ready · /);
  await expect(status(page, 'Grace')).toHaveText(/^ready · /);
}

test.describe('shared room lab', () => {
  test('DOCE-COLLAB-6.4 shows one document to two writers at their own widths and zooms', async ({
    lab,
    page,
  }) => {
    await openLab(lab, page);
    const roots = page.locator('.de-document-editor');
    await expect(roots.nth(0)).toHaveCSS('--de-zoom', '1');
    await expect(roots.nth(1)).toHaveCSS('--de-zoom', '0.6');
    const [wide, narrow] = await Promise.all([
      pane(page, 'Ada').boundingBox(),
      pane(page, 'Grace').boundingBox(),
    ]);
    expect(wide && narrow && wide.width > narrow.width).toBe(true);
    await typeAfter(page, 'Ada', 'Startup conditions', ' from Ada');
    await typeAfter(page, 'Grace', 'Shutdown responses', ' from Grace');
    await expect(editor(page, 'Grace')).toContainText('Startup conditions from Ada');
    await expect(editor(page, 'Ada')).toContainText('Shutdown responses from Grace');
    await expectSameDocument(page);
    await expect(status(page, 'Ada')).toHaveText('ready · saved');
  });

  test('DOCE-COLLAB-6.4 merges what two writers change apart without diverging', async ({
    lab,
    page,
  }) => {
    await openLab(lab, page);
    await pane(page, 'Ada').getByRole('button', { name: 'Go offline' }).click();
    await pane(page, 'Grace').getByRole('button', { name: 'Go offline' }).click();
    await typeAfter(page, 'Ada', 'Startup conditions', ' (Ada)');
    await typeAfter(page, 'Grace', 'Startup conditions', ' (Grace)');
    await typeAfter(page, 'Grace', 'Shutdown', ' now');
    await expect(editor(page, 'Ada')).not.toContainText('(Grace)');
    await pane(page, 'Ada').getByRole('button', { name: 'Go online' }).click();
    await pane(page, 'Grace').getByRole('button', { name: 'Go online' }).click();
    for (const name of ['Ada', 'Grace']) {
      await expect(editor(page, name)).toContainText('(Ada)');
      await expect(editor(page, name)).toContainText('(Grace)');
      await expect(editor(page, name)).toContainText('Shutdown now');
    }
    await expectSameDocument(page);
  });

  test('DOCE-COLLAB-6.4 DOCE-COLLAB-6.3 undoes only the writer’s own change', async ({
    lab,
    page,
  }) => {
    await openLab(lab, page);
    await typeAfter(page, 'Ada', 'Startup responses', ' mine');
    await expect(editor(page, 'Grace')).toContainText('Startup responses mine');
    await typeAfter(page, 'Grace', 'Shutdown conditions', ' theirs');
    await expect(editor(page, 'Ada')).toContainText('Shutdown conditions theirs');
    await editor(page, 'Ada').getByRole('heading', { name: 'Startup responses mine' }).click();
    await page.keyboard.press('ControlOrMeta+z');
    for (const name of ['Ada', 'Grace']) {
      await expect(editor(page, name)).not.toContainText('Startup responses mine');
      await expect(editor(page, name)).toContainText('Shutdown conditions theirs');
    }
    await expectSameDocument(page);
  });
});
