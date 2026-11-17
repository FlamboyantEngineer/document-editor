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

  test('DOCE-COLLAB-6.4 DOCE-FOOTNOTES-1.3 keeps the footnotes two writers insert in marker order, also suggesting', async ({
    lab,
    page,
  }) => {
    await openLab(lab, page);
    // Grace suggests: her footnote's marker and entry are her insertion.
    await page.getByLabel('Grace suggests').check();
    await typeAfter(page, 'Grace', 'Shutdown conditions', '');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Grace cites');
    await page.keyboard.press('ControlOrMeta+Alt+f');
    await page.keyboard.type('Second note');
    await typeAfter(page, 'Ada', 'Startup conditions', '');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Ada cites');
    await page.keyboard.press('ControlOrMeta+Alt+f');
    await page.keyboard.type('First note');
    for (const name of ['Ada', 'Grace']) {
      const entries = editor(page, name).locator('.pm-footnote-entry');
      await expect(entries).toHaveCount(2);
      // Each writer sees the entries in the order of their markers, numbered alike.
      await expect(entries.nth(0)).toContainText('First note');
      await expect(entries.nth(1)).toContainText('Second note');
      await expect(entries.nth(0)).toHaveAttribute('data-footnote-number', '1');
      await expect(entries.nth(1)).toHaveAttribute('data-footnote-number', '2');
    }
    // Grace's marker is in her suggested insertion, in her view and in Ada's document.
    const suggestedMarker = (name: string) =>
      editor(page, name)
        .locator('p', { hasText: 'Grace cites' })
        .locator('ins .footnote-reference');
    await expect(suggestedMarker('Grace')).toHaveCount(1);
    await page.getByLabel("Ada's web layout").check();
    await expect(suggestedMarker('Ada')).toHaveCount(1);
    await expect(editor(page, 'Ada').locator('ins .footnote-reference')).toHaveCount(1);
    await page.getByLabel("Ada's web layout").uncheck();
    await expectSameDocument(page);
    // Deleting a marker takes its entry away for both.
    await editor(page, 'Ada').locator('.pm-footnote-entry', { hasText: 'First note' }).click({
      button: 'right',
    });
    await page.getByRole('menuitem', { name: 'Go to footnote reference' }).click();
    await page.keyboard.press('Backspace');
    for (const name of ['Ada', 'Grace']) {
      const entries = editor(page, name).locator('.pm-footnote-entry');
      await expect(entries).toHaveCount(1);
      await expect(entries.first()).toContainText('Second note');
      await expect(entries.first()).toHaveAttribute('data-footnote-number', '1');
    }
    await expectSameDocument(page);
  });
});
