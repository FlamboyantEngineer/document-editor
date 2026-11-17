import type { Page } from '@playwright/test';
import type { RegressionDocumentName } from '../labs/src/regression/regression-documents.js';
import type { DocumentFile, StoredNode } from '../src/model/index.js';
import { expect, test, waitForLab } from './fixtures.js';

// Paragraphs split across pages, read and edited in the regression lab as a writer sees them:
// how full each page is where one breaks, how many lines each part shows, and what keys and
// selections at and across the break do to the stored document.

async function openDocument(page: Page, name: RegressionDocumentName) {
  await page.goto(`regression.html?document=${name}&layout=page`);
  await waitForLab(page);
}

const settle = (page: Page) =>
  page.evaluate(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return window.stressLab.whenSettled();
  });

/** A part of a split paragraph on a page. */
interface PartRead {
  readonly id: string;
  readonly part: number;
  readonly lines: number;
  readonly text: string;
}

/** A page: its paragraph parts, and the room left below its last block, in lines of that block. */
interface PageRead {
  readonly parts: readonly PartRead[];
  readonly lastPart: PartRead | null;
  readonly spareLines: number;
  readonly overflows: boolean;
}

// Reads every page. It runs in the page, so it holds everything it uses.
function readPages(): PageRead[] {
  const lineHeight = (element: Element) => Number.parseFloat(getComputedStyle(element).lineHeight);
  const partOf = (block: Element) => ({
    id: block.getAttribute('data-id') ?? '',
    part: Number(block.getAttribute('data-split-part-index')),
    lines: Math.round(block.getBoundingClientRect().height / lineHeight(block)),
    text: block.textContent ?? '',
  });
  const isPart = (block: Element) =>
    block.tagName === 'P' && block.hasAttribute('data-split-part-index');
  const pages = document.querySelectorAll('.de-document-editor__content .pm-page');
  return [...pages].map((page) => {
    const body = page.querySelector<HTMLElement>('.pm-page-content');
    const blocks = [...(body?.children ?? [])];
    const last = blocks.at(-1) ?? null;
    const bottom = body?.getBoundingClientRect().bottom ?? 0;
    const spare = last ? bottom - last.getBoundingClientRect().bottom : 0;
    return {
      parts: blocks.filter(isPart).map(partOf),
      lastPart: last && isPart(last) ? partOf(last) : null,
      spareLines: last ? spare / lineHeight(last) : 0,
      overflows: body ? body.scrollHeight > body.clientHeight + 1 : false,
    };
  });
}

const pagesOf = (page: Page) => page.evaluate(readPages);

function storedText(nodes: readonly StoredNode[]): string {
  return nodes.map((node) => (node.text ?? '') + storedText(node.content ?? [])).join('');
}

// Each stored paragraph's id and text, in order.
async function storedParagraphs(page: Page): Promise<{ id: string; text: string }[]> {
  const file = (await page.evaluate(() => window.regressionLab.stored())) as DocumentFile;
  const found: { id: string; text: string }[] = [];
  const walk = (nodes: readonly StoredNode[]) => {
    for (const node of nodes) {
      if (node.type === 'paragraph')
        found.push({ id: String(node.attrs?.id ?? ''), text: storedText(node.content ?? []) });
      else walk(node.content ?? []);
    }
  };
  for (const section of file.sections) walk(section.content);
  return found;
}

// Where a part's text starts in its paragraph's: after the text of the parts before it.
const partStart = (pages: readonly PageRead[], part: PartRead) =>
  pages
    .flatMap((each) => each.parts)
    .filter((each) => each.id === part.id && each.part < part.part)
    .reduce((sum, each) => sum + each.text.length, 0);

const textOf = async (page: Page, id: string) =>
  (await storedParagraphs(page)).find((each) => each.id === id)?.text ?? '';

// The pages hold their content, every part shows two lines or more, no page shows two parts of
// one paragraph, and a page whose last block is a part continued on the next page has less than a
// line to spare, unless one more line there would leave the next part a single line.
function expectSplitsFill(pages: readonly PageRead[]) {
  expect(pages.filter((each) => each.overflows)).toEqual([]);
  for (const [index, each] of pages.entries()) {
    for (const part of each.parts)
      expect(part.lines, `${part.id}#${String(part.part)}`).toBeGreaterThanOrEqual(2);
    const ids = each.parts.map(({ id }) => id);
    expect(new Set(ids).size, `parts on page ${String(index + 1)}`).toBe(ids.length);
    const next = pages[index + 1]?.parts[0];
    const continues =
      next?.id === each.lastPart?.id && next?.part === (each.lastPart?.part ?? 0) + 1;
    if (continues && (next?.lines ?? 0) > 2) {
      expect(each.spareLines, `room left on page ${String(index + 1)}`).toBeLessThan(1);
    }
  }
}

// Selects text of the pages from an offset in one element's first text to an offset in another's.
async function selectText(
  page: Page,
  from: { id: string; part: number; offset: number },
  to: { id: string; part: number; offset: number },
) {
  await page.evaluate(
    ([start, end]) => {
      const textIn = ({ id, part }: { id: string; part: number }) => {
        const element = [
          ...document.querySelectorAll(`.de-document-editor__content p[data-id="${id}"]`),
        ].find((each) => Number(each.getAttribute('data-split-part-index') ?? 0) === part);
        const walker = document.createTreeWalker(element ?? document.body, NodeFilter.SHOW_TEXT);
        return walker.nextNode() ?? document.body;
      };
      const editor = document.querySelector<HTMLElement>(
        '.de-document-editor__content [contenteditable="true"]',
      );
      editor?.focus();
      getSelection()?.setBaseAndExtent(textIn(start), start.offset, textIn(end), end.offset);
    },
    [from, to] as const,
  );
  await page.waitForTimeout(50);
}

test.describe('split paragraphs', () => {
  test('DOCE-LABS-4.2 DOCE-PAGINATION-3.1 DOCE-PAGINATION-3.2 fills each page a long paragraph runs over, two lines or more a part', async ({
    page,
  }) => {
    await openDocument(page, 'oversized-blocks');
    const pages = await pagesOf(page);
    expect(pages.filter((each) => each.parts.length > 0).length).toBeGreaterThan(2);
    expectSplitsFill(pages);
  });

  test('DOCE-LABS-4.2 DOCE-PAGINATION-3.1 splits a paragraph that grows past a page end, using the room left', async ({
    page,
  }) => {
    await openDocument(page, 'long-mixed');
    // The last paragraph of the first page after the first that ends with a whole paragraph.
    const id = await page.evaluate(() => {
      const pages = [...document.querySelectorAll('.de-document-editor__content .pm-page')];
      for (const each of pages.slice(1)) {
        const last = each.querySelector('.pm-page-content')?.lastElementChild;
        const text = last?.lastChild;
        if (last?.tagName !== 'P' || last.hasAttribute('data-split-part-index') || !text) continue;
        last.closest<HTMLElement>('[contenteditable="true"]')?.focus();
        getSelection()?.collapse(text, text.textContent?.length ?? 0);
        return last.getAttribute('data-id') ?? '';
      }
      return '';
    });
    expect(id).not.toBe('');
    await page.waitForTimeout(50);
    await page.keyboard.type(
      ' The notes went on for a while, and were kept with the others.'.repeat(10),
    );
    await settle(page);
    const after = await pagesOf(page);
    expect(
      after.flatMap((each) => each.parts).filter((part) => part.id === id).length,
    ).toBeGreaterThan(1);
    expectSplitsFill(after);
  });

  test('DOCE-LABS-4.2 DOCE-EDITING-2.4 deletes a range inside a later part of a split paragraph, and only that', async ({
    page,
  }) => {
    await openDocument(page, 'oversized-blocks');
    const pages = await pagesOf(page);
    const part = pages.flatMap((each) => each.parts).find((each) => each.part === 2);
    if (!part) throw new Error('no third part');
    const whole = await textOf(page, part.id);
    const others = (await storedParagraphs(page)).filter((each) => each.id !== part.id);
    const at = partStart(pages, part);
    expect(whole.slice(at, at + part.text.length)).toBe(part.text);
    await selectText(page, { ...part, offset: 10 }, { ...part, offset: 40 });
    await page.keyboard.press('Backspace');
    await settle(page);
    expect(await textOf(page, part.id)).toBe(whole.slice(0, at + 10) + whole.slice(at + 40));
    expect((await storedParagraphs(page)).filter((each) => each.id !== part.id)).toEqual(others);
    expectSplitsFill(await pagesOf(page));
  });

  test('DOCE-LABS-4.2 DOCE-EDITING-2.4 deletes six characters in order with six Backspaces at a page break', async ({
    page,
  }) => {
    await openDocument(page, 'oversized-blocks');
    const before = await pagesOf(page);
    const caret = await page.evaluate(() =>
      window.regressionLab.caretAtFragment('paragraph', 'continuation-start'),
    );
    if (!caret) throw new Error('no split paragraph');
    const whole = await textOf(page, caret.elementId);
    const head = before.flatMap((each) => each.parts).find((each) => each.part === 0);
    const end = head?.text.length ?? 0;
    expect(whole.startsWith(head?.text ?? '-')).toBe(true);
    for (let count = 1; count <= 6; count += 1) {
      await page.keyboard.press('Backspace');
      await settle(page);
      expect(await textOf(page, caret.elementId)).toBe(
        whole.slice(0, end - count) + whole.slice(end),
      );
    }
    const after = await pagesOf(page);
    expect(after.length).toBe(before.length);
    expect(after.flatMap((each) => each.parts).length).toBe(
      before.flatMap((each) => each.parts).length,
    );
    expectSplitsFill(after);
  });

  test('DOCE-LABS-4.2 DOCE-EDITING-2.4 types over a selection that runs across a page break', async ({
    page,
  }) => {
    await openDocument(page, 'oversized-blocks');
    const parts = (await pagesOf(page)).flatMap((each) => each.parts);
    const [first, second] = [parts[0], parts[1]];
    if (!first || !second) throw new Error('no split paragraph');
    const whole = await textOf(page, first.id);
    const start = first.text.length - 20;
    const end = partStart(await pagesOf(page), second) + 15;
    await selectText(page, { ...first, offset: start }, { ...second, offset: 15 });
    await page.keyboard.type('Z');
    await settle(page);
    expect(await textOf(page, first.id)).toBe(`${whole.slice(0, start)}Z${whole.slice(end)}`);
    expectSplitsFill(await pagesOf(page));
  });

  test('DOCE-LABS-4.2 DOCE-EDITING-2.4 types over a selection from one paragraph into the next', async ({
    page,
  }) => {
    await openDocument(page, 'mixed-geometry');
    const before = await storedParagraphs(page);
    const pair = await page.evaluate(() => {
      for (const body of document.querySelectorAll(
        '.de-document-editor__content .pm-page-content',
      )) {
        const blocks = [...body.children];
        for (const [index, block] of blocks.entries()) {
          const next = blocks[index + 1];
          const long = (each: Element | undefined) => (each?.textContent?.length ?? 0) > 40;
          if (block.tagName === 'P' && next?.tagName === 'P' && long(block) && long(next))
            return [block.getAttribute('data-id'), next.getAttribute('data-id')];
        }
      }
      return null;
    });
    const [firstId, secondId] = pair ?? [];
    if (!firstId || !secondId) throw new Error('no two paragraphs in a row');
    const at = before.findIndex((each) => each.id === firstId);
    const [first, second] = [before[at], before[at + 1]];
    expect(second?.id).toBe(secondId);
    await selectText(
      page,
      { id: firstId, part: 0, offset: 20 },
      { id: secondId, part: 0, offset: 30 },
    );
    await page.keyboard.type('Z');
    await settle(page);
    const after = await storedParagraphs(page);
    expect(after.length).toBe(before.length - 1);
    expect(after[at]?.text).toBe(
      `${first?.text.slice(0, 20) ?? ''}Z${second?.text.slice(30) ?? ''}`,
    );
    expect(after.slice(at + 1)).toEqual(before.slice(at + 2));
    expect((await pagesOf(page)).filter((each) => each.overflows)).toEqual([]);
  });
});
