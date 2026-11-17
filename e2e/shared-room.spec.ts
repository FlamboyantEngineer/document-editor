import type { Page } from '@playwright/test';
import type { CollabRoomProbe } from '../labs/src/collab-room.lab.js';
import { expect, test } from './fixtures.js';

declare global {
  interface Window {
    collabRoom: CollabRoomProbe;
  }
}

const status = (page: Page, name: string) => page.getByLabel(`${name}'s status`);
const editor = (page: Page, name: string) =>
  page.getByRole('textbox', { name: `${name}'s document` });
const pane = (page: Page, name: string) => page.getByRole('region', { name });

// Types at the end of a heading in a writer's document, placing the caret by clicking past its text;
// the first heading whose name holds `heading` unless `exact`.
async function typeAfter(
  page: Page,
  name: string,
  heading: string,
  value: string,
  { exact = true }: { exact?: boolean } = {},
) {
  const target = editor(page, name).getByRole('heading', { name: heading, exact }).first();
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error(`The heading ${heading} is not shown.`);
  await page.mouse.click(box.x + box.width - 2, box.y + box.height / 2);
  // A click soon after one at the same place is a double click, which selects the heading's text.
  await page.keyboard.press('End');
  await page.keyboard.type(value);
}

// A writer's document text, without the other writer's caret and its name label.
const documentText = (page: Page, name: string) =>
  editor(page, name).evaluate((root) => {
    const copy = root.cloneNode(true) as Element;
    for (const caret of copy.querySelectorAll('.de-presence-caret')) caret.remove();
    return copy.textContent;
  });

// Both writers hold the same document: the same text, page for page.
async function expectSameDocument(page: Page) {
  await expect(async () => {
    const [ada, grace] = await Promise.all([
      documentText(page, 'Ada'),
      documentText(page, 'Grace'),
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

  test('DOCE-COLLAB-6.4 DOCE-COLLAB-6.3 DOCE-PAGINATION-7.15 keeps the binding and undo through layout switches while the other writes', async ({
    lab,
    page,
  }) => {
    await openLab(lab, page);
    const web = page.getByLabel("Ada's web layout");
    await typeAfter(page, 'Ada', 'Startup responses', ' mine');
    await expect(editor(page, 'Grace')).toContainText('Startup responses mine');
    await web.check();
    await typeAfter(page, 'Grace', 'Shutdown conditions', ' theirs');
    await expect(editor(page, 'Ada')).toContainText('Shutdown conditions theirs');
    await web.uncheck();
    await typeAfter(page, 'Grace', 'Shutdown conditions theirs', ' again');
    await expect(editor(page, 'Ada')).toContainText('Shutdown conditions theirs again');
    await web.check();
    await editor(page, 'Ada').getByRole('heading', { name: 'Startup responses mine' }).click();
    await page.keyboard.press('ControlOrMeta+z');
    for (const name of ['Ada', 'Grace']) {
      await expect(editor(page, name)).not.toContainText('Startup responses mine');
      await expect(editor(page, name)).toContainText('Shutdown conditions theirs again');
    }
    await web.uncheck();
    await expectSameDocument(page);
  });

  // How many times a text shows in each writer's pages and in each one's own document.
  async function countsOf(page: Page, token: string) {
    const count = (text: string | null) => (text ?? '').split(token).length - 1;
    const canonical = await page.evaluate(() => [
      window.collabRoom.canonicalText('Ada'),
      window.collabRoom.canonicalText('Grace'),
    ]);
    return [
      count(await documentText(page, 'Ada')),
      count(await documentText(page, 'Grace')),
      ...canonical.map(count),
    ];
  }

  const expectOnce = async (page: Page, token: string) => {
    await expect.poll(() => countsOf(page, token)).toEqual([1, 1, 1, 1]);
  };

  test('DOCE-COLLAB-6.4 DOCE-EDITOR-2.2 keeps each change of a writer once while the other switches between page and web view', async ({
    lab,
    page,
  }) => {
    await openLab(lab, page);
    const web = page.getByLabel("Ada's web layout");
    const tokens: string[] = [];
    for (const round of [1, 2]) {
      for (const view of ['Web', 'Page'] as const) {
        const token = ` token${String(round)}${view}`;
        tokens.push(token.trim());
        // Grace types while Ada's pages are taken down or put up.
        await web.setChecked(view === 'Web');
        await typeAfter(page, 'Grace', 'Startup conditions', token, { exact: false });
        await expect(editor(page, 'Ada')).toContainText(token.trim());
      }
    }
    for (const token of tokens) await expectOnce(page, token);
    await expectSameDocument(page);
  });

  test('DOCE-COLLAB-6.4 DOCE-PAGINATION-7.11 DOCE-PAGINATION-7.12 types, splits, deletes, bolds, undoes, redoes and pastes on the pages beside a peer, each once', async ({
    lab,
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openLab(lab, page);
    const strong = (name: string) => editor(page, name).locator('strong', { hasText: 'qwerty' });
    await typeAfter(page, 'Ada', 'Startup conditions', ' alpha');
    await expectOnce(page, 'Startup conditions alpha');
    await page.keyboard.press('Enter');
    await page.keyboard.type('qwerty line');
    await expectOnce(page, 'qwerty line');
    for (let count = 0; count < 5; count += 1) await page.keyboard.press('Backspace');
    await expect.poll(() => countsOf(page, 'qwerty line')).toEqual([0, 0, 0, 0]);
    await expectOnce(page, 'qwerty');
    // A pause, so the bold is an undo step of its own rather than part of the typing.
    await page.waitForTimeout(600);
    await page.keyboard.press('Shift+Home');
    await page.keyboard.press('ControlOrMeta+b');
    for (const name of ['Ada', 'Grace']) await expect(strong(name)).toHaveCount(1);
    await page.keyboard.press('ControlOrMeta+z');
    for (const name of ['Ada', 'Grace']) await expect(strong(name)).toHaveCount(0);
    await expectOnce(page, 'qwerty');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    for (const name of ['Ada', 'Grace']) await expect(strong(name)).toHaveCount(1);
    await page.keyboard.press('End');
    await page.evaluate(() => navigator.clipboard.writeText(' pasted words'));
    await page.keyboard.press('ControlOrMeta+v');
    await expectOnce(page, 'qwerty pasted words');
    await expectOnce(page, 'Startup conditions alpha');
    await expectSameDocument(page);
  });
});
