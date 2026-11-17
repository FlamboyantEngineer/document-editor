import type { Locator, Page } from '@playwright/test';
import type { RegressionProbe } from '../labs/src/regression/regression-probe.js';
import type { StressProbe } from '../labs/src/stress/stress-probe.js';
import type { DocumentFile, StoredNode } from '../src/model/index.js';
import { expect, test, waitForLab } from './fixtures.js';

// Split linked and authored code in the regression lab's `code-block-stress` document: the
// fragments each page shows, how they number their lines and what a writer can do on any of them.

declare global {
  interface Window {
    regressionLab: RegressionProbe;
    stressLab: StressProbe;
  }
}

const WHOLE_FILE = 'c0de0004';

async function openStress(page: Page) {
  await page.goto('regression.html?document=code-block-stress&layout=page');
  await waitForLab(page);
  await page.evaluate(() => window.stressLab.whenSettled());
}

const settle = (page: Page) =>
  page.evaluate(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return window.stressLab.whenSettled();
  });

// The stored blocks of the document's sections, in order.
async function storedBlocks(page: Page): Promise<StoredNode[]> {
  const file = (await page.evaluate(() => window.regressionLab.stored())) as DocumentFile;
  return file.sections.flatMap((section) => section.content ?? []);
}

const fragment = (page: Page, id: string, part: number) =>
  page.locator(
    `.de-document-editor__content .pm-page [data-id="${id}"][data-split-part-index="${String(part)}"]`,
  );

// A fragment's markup and box, without what selecting it adds.
const shape = (locator: Locator) =>
  locator.evaluate((element) => {
    const copy = element.cloneNode(true) as Element;
    copy.classList.remove('ProseMirror-selectednode');
    copy.removeAttribute('draggable');
    const { x, y, width, height } = element.getBoundingClientRect();
    return { markup: copy.outerHTML, box: { x, y, width, height } };
  });

test.describe('split linked code', () => {
  test('DOCE-LABS-4.5 DOCE-PAGINATION-3.3 numbers each linked fragment on from the last and flags the continued ones', async ({
    page,
  }) => {
    await openStress(page);
    const fragments = await page
      .locator('.de-document-editor__content .pm-page [data-id].linked-code-block')
      .evaluateAll((all) =>
        all.map((block) => ({
          id: block.getAttribute('data-id') ?? '',
          start: Number(block.getAttribute('data-start-line')),
          continued: block.hasAttribute('data-code-block-continued'),
          caption: block.querySelector('.doc-linked-code-caption-line')?.textContent ?? '',
          numbers: [...block.querySelectorAll('.de-code-gutter__number')].map((number) =>
            Number(number.textContent),
          ),
          lines: (block.querySelector('code')?.textContent ?? '').split('\n'),
          displays: block.querySelectorAll('pre').length,
        })),
      );
    const byId = new Map<string, typeof fragments>();
    for (const each of fragments) byId.set(each.id, [...(byId.get(each.id) ?? []), each]);
    const split = [...byId.values()].filter((parts) => parts.length > 1);
    expect(split.length).toBe(3);
    for (const parts of split) {
      for (const [index, part] of parts.entries()) {
        expect(part.displays).toBe(1);
        expect(part.continued).toBe(index > 0);
        expect(part.caption).toBe(parts[0]?.caption);
        expect(part.numbers[0]).toBe(part.start);
        expect(part.numbers).toHaveLength(part.lines.length);
        const next = parts[index + 1];
        if (!next) continue;
        // A fragment's range runs into the next one's, and holds no blank row at its end.
        expect(next.start).toBe(part.start + part.lines.length);
        expect(part.lines.at(-1)).not.toBe('');
      }
    }
  });

  test('DOCE-OBJECTS-3.1 keeps a continued fragment drawn as it was when it is selected', async ({
    page,
  }) => {
    await openStress(page);
    const continued = fragment(page, WHOLE_FILE, 1);
    await continued.scrollIntoViewIfNeeded();
    const before = await shape(continued);
    await continued.click();
    await expect(continued).toHaveClass(/ProseMirror-selectednode/);
    expect(await shape(continued)).toEqual(before);
    // The first fragment is drawn as before too.
    const first = fragment(page, WHOLE_FILE, 0);
    const firstBefore = await shape(first);
    await first.scrollIntoViewIfNeeded();
    await first.click();
    await expect(first).toHaveClass(/ProseMirror-selectednode/);
    expect((await shape(first)).markup).toBe(firstBefore.markup);
  });

  test('DOCE-OBJECTS-1.2 refuses typing, replacement and composition on a continued fragment alone on its page, and Enter adds a paragraph after', async ({
    page,
  }) => {
    await openStress(page);
    const continued = fragment(page, WHOLE_FILE, 1);
    await continued.scrollIntoViewIfNeeded();
    // The fragment is the only block of its page.
    const others = await continued.evaluate(
      (element) => element.closest('.pm-page-content')?.children.length ?? 0,
    );
    expect(others).toBe(1);
    const before = await storedBlocks(page);
    await continued.click();
    await page.keyboard.type('x');
    await page.keyboard.insertText('yz');
    const session = await page.context().newCDPSession(page);
    await session.send('Input.imeSetComposition', {
      text: 'é',
      selectionStart: 1,
      selectionEnd: 1,
    });
    await session.send('Input.insertText', { text: 'é' });
    await settle(page);
    expect(await storedBlocks(page)).toEqual(before);
    await expect(continued).toHaveClass(/ProseMirror-selectednode/);
    await page.keyboard.press('Enter');
    await settle(page);
    const after = await storedBlocks(page);
    const at = after.findIndex((block) => block.attrs?.id === WHOLE_FILE);
    expect(after).toHaveLength(before.length + 1);
    expect(after[at + 1]?.type).toBe('paragraph');
    expect(after[at]).toEqual(before[at]);
  });

  test('DOCE-EDITOR-3.8 edits and deletes the whole linked block from a continued fragment', async ({
    page,
  }) => {
    await openStress(page);
    const continued = fragment(page, WHOLE_FILE, 2);
    await continued.scrollIntoViewIfNeeded();
    const url = await continued.getAttribute('data-url');
    await continued.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Edit linked code…' }).click();
    const address = page.getByRole('textbox', { name: 'Code address' });
    await expect(address).toHaveValue(url ?? '');
    await address.fill(`${url ?? ''}#L1-L5`);
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('code')).toContainText('line 5');
    await dialog.getByRole('button', { name: 'Apply' }).click();
    await settle(page);
    const edited = (await storedBlocks(page)).find((block) => block.attrs?.id === WHOLE_FILE);
    expect(String(edited?.attrs?.code).split('\n')).toHaveLength(5);
    await expect(
      page.locator(`.de-document-editor__content .pm-page [data-id="${WHOLE_FILE}"]`),
    ).toHaveCount(1);

    // Deleting from a continued fragment of another block removes that block alone.
    const before = await storedBlocks(page);
    const range = fragment(page, 'c0de0005', 1);
    await range.scrollIntoViewIfNeeded();
    await range.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    await settle(page);
    const after = await storedBlocks(page);
    expect(after.map((block) => block.attrs?.id)).toEqual(
      before.map((block) => block.attrs?.id).filter((id) => id !== 'c0de0005'),
    );
    await expect(
      page.locator('.de-document-editor__content .pm-page [data-id="c0de0005"]'),
    ).toHaveCount(0);
  });
});

test.describe('split authored code', () => {
  test('DOCE-PAGINATION-3.3 measures only the code block a same-height edit in its middle fragment changes', async ({
    page,
  }) => {
    await openStress(page);
    const middle = page
      .locator('.de-document-editor__content .pm-page pre[data-split-part-index="1"]')
      .first();
    await middle.scrollIntoViewIfNeeded();
    const settled = await page.evaluate(() => window.stressLab.layoutStats());
    // A character typed over another keeps the line, and so the fragment, as tall as it was.
    const end = await middle.evaluate((element) => {
      const code = element.querySelector('code');
      const walker = document.createTreeWalker(code ?? element, NodeFilter.SHOW_TEXT);
      const text = walker.nextNode() as Text;
      const range = document.createRange();
      range.setStart(text, 4);
      range.setEnd(text, 5);
      const box = range.getBoundingClientRect();
      return { x: box.left + 1, y: box.top + box.height / 2 };
    });
    await page.mouse.click(end.x, end.y);
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.type('Q');
    await settle(page);
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => window.stressLab.layoutStats());
    expect((after?.blocksMeasured ?? 0) - (settled?.blocksMeasured ?? 0)).toBeLessThanOrEqual(1);
    expect(after?.pagesRebuilt).toBe(settled?.pagesRebuilt);
    expect(after?.overflowPages).toBe(settled?.overflowPages);
  });
});
