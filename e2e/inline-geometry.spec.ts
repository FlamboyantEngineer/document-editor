import type { Page } from '@playwright/test';
import type { DocumentFile } from '../src/model/index.js';
import { expect, test, waitForLab } from './fixtures.js';

// Inline geometry on the engine's lines (specs/PAGINATION.md DOCE-PAGINATION-9.3, 9.6, 11.2,
// 13.1): the regression lab's `inline-geometry` document, whose superscripts, subscripts,
// no-break spaces in justified text, soft hyphens, aligned numbered headings, citation identifiers
// and code beside line numbers the pages must draw exactly as the layout engine laid them out.

async function open(page: Page) {
  await page.goto('regression.html?document=inline-geometry&debug');
  await waitForLab(page);
  await page.evaluate(() => window.regressionLab.drawAllLines(true));
}

// Each block of the pages whose drawn height is not the one the layout gave it. Code figures are
// left out: their caption line is drawn below the height packed in both modes (Q4, finding V2).
const offPlan = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.pm-page-content > [data-debug-height]')]
      .filter((block) => block.dataset.debugType !== 'code_figure')
      .map((block) => ({
        type: block.dataset.debugType,
        id: block.dataset.id,
        planned: Number(block.dataset.debugHeight),
        drawn: Math.round(block.getBoundingClientRect().height * 1000) / 1000,
      }))
      .filter((block) => Math.abs(block.drawn - block.planned) > 0.5),
  );

// Each heading on one line: where its number starts (its first-line indent), and the room left
// after its text, from its page's content edges. Both sides are equal when it is centred, and the
// second is nothing when it is right-aligned.
const headingGaps = (page: Page) =>
  page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        '.de-document-editor__content .pm-page-content > :is(h1, h2)',
      ),
    ].flatMap((heading) => {
      const whole = document.createRange();
      whole.selectNodeContents(heading);
      const rects = [...whole.getClientRects()];
      if (new Set(rects.map((rect) => Math.round(rect.top))).size !== 1) return [];
      const content = heading.closest('.pm-page-content')?.getBoundingClientRect();
      const indent = parseFloat(getComputedStyle(heading).getPropertyValue('--de-first-indent'));
      return [
        {
          id: heading.dataset.id,
          tag: heading.tagName,
          before: Number.isNaN(indent) ? 0 : indent,
          after: (content?.right ?? 0) - Math.max(...rects.map((rect) => rect.right)),
        },
      ];
    }),
  );

test.describe('inline geometry on the engine’s lines', () => {
  test('DOCE-PAGINATION-9.3 DOCE-PAGINATION-9.6 DOCE-PAGINATION-13.1 draws each block at the height the engine gave it', async ({
    page,
  }) => {
    await open(page);
    expect(await page.evaluate(() => window.regressionLab.wrappedLines())).toEqual([]);
    expect(await offPlan(page)).toEqual([]);
  });

  test('DOCE-PAGINATION-9.3 draws subscripts and superscripts without growing a line', async ({
    page,
  }) => {
    await open(page);
    const heights = await page.evaluate(() =>
      [...document.querySelectorAll('.de-document-editor__content .pm-page-content sup')]
        .slice(0, 3)
        .map((sup) => getComputedStyle(sup).lineHeight),
    );
    expect(heights).toEqual(['0px', '0px', '0px']);
  });

  test('DOCE-PAGINATION-13.1 starts an aligned numbered heading’s first line before its number', async ({
    page,
  }) => {
    await open(page);
    const headings = await headingGaps(page);
    // A centred first level and a right-aligned second level.
    expect(new Set(headings.map((heading) => heading.tag))).toEqual(new Set(['H1', 'H2']));
    for (const heading of headings) {
      const { id, before, after } = heading;
      if (heading.tag === 'H1') expect(Math.abs(before - after), id).toBeLessThanOrEqual(1);
      else expect(Math.abs(after), id).toBeLessThanOrEqual(1);
      expect(before, id).toBeGreaterThan(0);
    }
  });

  test('DOCE-PAGINATION-13.1 shows the hyphen at a line that ends at a soft hyphen', async ({
    page,
  }) => {
    await open(page);
    const ends = await page.evaluate(() =>
      [...document.querySelectorAll('.de-forced-lines__hyphen')].map(
        (end) => getComputedStyle(end, '::after').content,
      ),
    );
    expect(ends.length).toBeGreaterThan(3);
    expect(new Set(ends)).toEqual(new Set(['"‐\\a "']));
  });

  test('DOCE-REFERENCES-1.13 DOCE-PAGINATION-9.4 keeps each citation identifier on one line', async ({
    page,
  }) => {
    await open(page);
    // The document cites `GRD-PLAN` at `Rev B` at sixteen places along a line; no computed line
    // may end inside either identifier.
    const lines = await page.evaluate(() =>
      window.regressionLab
        .textLines()
        .flatMap((each) => each.blocks)
        .flatMap((block) => block.lines ?? [])
        .map((line) => line.text),
    );
    expect(lines.filter((text) => text.includes('GRD-PLAN')).length).toBeGreaterThan(15);
    expect(lines.filter((text) => /(GRD-|Rev )$/.test(text))).toEqual([]);
  });

  test.describe('a comparison’s deleted words', () => {
    async function compare(page: Page) {
      await page.goto('regression.html?document=inline-geometry&debug&compare=markup');
      await waitForLab(page);
      await page.evaluate(() => window.regressionLab.drawAllLines(true));
    }

    // The pages' paragraph with that id, as the editor draws it.
    const paragraph = (page: Page, id: string | null) =>
      page.locator(`.de-document-editor__content .pm-page-content > p[data-id="${String(id)}"]`);

    // Draws the pages again on forced lines, and reads which blocks the browser drew otherwise.
    async function drawnAsPlanned(page: Page) {
      await page.evaluate(() => window.regressionLab.drawAllLines(true));
      await expect.poll(() => page.evaluate(() => window.regressionLab.wrappedLines())).toEqual([]);
      expect(await offPlan(page)).toEqual([]);
    }

    test('DOCE-PAGINATION-11.11 lays deleted words out on the engine’s lines, word by word', async ({
      page,
    }) => {
      await compare(page);
      // The first paragraph over several lines loses forty words from its middle, which the
      // comparison shows in place, over more than one line.
      const id = await page.evaluate(
        () =>
          [...document.querySelectorAll<HTMLElement>('.pm-page-content > p[data-lines]')].find(
            (block) => block.getBoundingClientRect().height > 60,
          )?.dataset.id ?? null,
      );
      expect(id).not.toBeNull();
      const block = paragraph(page, id);
      const box = await block.boundingBox();
      await block.click({ position: { x: (box?.width ?? 200) / 2, y: 8 } });
      for (let word = 0; word < 40; word += 1)
        await page.keyboard.press('Control+Shift+ArrowRight');
      await page.keyboard.press('Delete');
      const words = block.locator('del[data-diff-change="deletion"]');
      await expect.poll(() => words.count()).toBeGreaterThan(30);
      // The block keeps the engine's lines, one of which breaks between two deleted words.
      await expect(block).toHaveClass(/de-forced-lines/);
      await expect(block.locator('.de-forced-lines__break')).not.toHaveCount(0);
      await drawnAsPlanned(page);
    });

    test('DOCE-PAGINATION-12.4 draws a deleted word no served font draws in its reserved boxes', async ({
      page,
    }) => {
      await page.goto(
        'regression.html?document=line-breaks-and-writing-systems&debug&compare=markup',
      );
      await waitForLab(page);
      await page.evaluate(() => window.regressionLab.drawAllLines(true));
      const block = page
        .locator('.de-document-editor__content .pm-page-content > p[data-lines]')
        .filter({ hasText: 'East Asian' });
      // The content's own ideographs are drawn in reserved boxes, as no served face has them.
      await expect(block.locator('.de-forced-lines__reserved').first()).toBeAttached();
      // Deletes the first two ideographs, which the comparison then shows deleted in place.
      await block.evaluate((element) => {
        // Each ideograph is a text node of its own, in its box.
        const texts: Text[] = [];
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        for (let text = walker.nextNode(); text; text = walker.nextNode()) texts.push(text as Text);
        const first = texts.find((text) => text.data.startsWith('雨'));
        const second = texts.find((text) => text.data.startsWith('量'));
        if (!first || !second) throw new Error('no ideographs to delete');
        const range = document.createRange();
        range.setStart(first, 0);
        range.setEnd(second, 1);
        getSelection()?.removeAllRanges();
        getSelection()?.addRange(range);
      });
      await page.keyboard.press('Delete');
      const deleted = block.locator('del[data-diff-change="deletion"]');
      await expect(deleted.first()).toBeAttached();
      await expect(deleted.locator('.de-forced-lines__reserved')).not.toHaveCount(0);
      await drawnAsPlanned(page);
    });

    test('DOCE-PAGINATION-11.11 lays a deleted block’s text out on lines of its own', async ({
      page,
    }) => {
      await compare(page);
      // A paragraph after another is deleted with the end of the one before: its text shows in
      // the next block, before that block's own.
      const id = await page.evaluate(
        () =>
          [...document.querySelectorAll<HTMLElement>('.pm-page-content > p[data-lines]')].find(
            (block) => block.previousElementSibling?.matches('p[data-lines]'),
          )?.dataset.id ?? null,
      );
      const block = paragraph(page, id);
      const text = (await block.textContent()) ?? '';
      await block.click();
      await page.keyboard.press('End');
      for (let line = 0; line < 12; line += 1) await page.keyboard.press('Shift+ArrowUp');
      await page.keyboard.press('Shift+Home');
      await page.keyboard.press('Shift+ArrowLeft');
      await page.keyboard.press('Delete');
      const deleted = page.locator('.de-document-editor__content del[data-diff-block]');
      await expect
        .poll(async () => (await deleted.allTextContents()).join(''))
        .toContain(text.trim());
      await drawnAsPlanned(page);
    });
  });
  test.describe('inline embeds', () => {
    type Stored = DocumentFile['sections'][number]['content'][number];
    const embed = (text: string) =>
      ({ type: 'embed_inline', attrs: { kind: 'cell', source: 'book!B2', text } }) as Stored;
    const words = (value: string) => ({ type: 'text', text: value }) as Stored;
    // A paragraph with an embed mid-line, and a long one with an embed after every few words, so
    // some end a wrapped line and the next words start the line after.
    const content: Stored[] = [
      {
        type: 'paragraph',
        content: [words('Units sold '), embed('1,204 units'), words(' so far.')],
      },
      {
        type: 'paragraph',
        content: Array.from({ length: 24 }, (_, at) => [
          words(at % 2 ? ' and then a few more words ' : ' with words around the value '),
          embed(`Q${String((at % 4) + 1)} total`),
        ]).flat(),
      },
    ] as Stored[];

    test('DOCE-PAGINATION-9.5 draws an inline embed’s stored text on the engine’s lines, whole, mid-line and at a line’s end', async ({
      page,
    }) => {
      await page.goto('regression.html?document=minimal-paragraph&debug');
      await waitForLab(page);
      const file = { formatVersion: 1, sections: [{ name: null, content }] } as DocumentFile;
      await page.evaluate((stored) => window.regressionLab.load(stored), file);
      await page.waitForFunction(() => window.regressionLab.layout() !== null);
      await page.evaluate(() => window.regressionLab.drawAllLines(true));
      await expect.poll(() => page.evaluate(() => window.regressionLab.wrappedLines())).toEqual([]);
      expect(await offPlan(page)).toEqual([]);
      // Each embed sits on one line; at least one ends its line, the text after it on the next.
      const placed = await page.evaluate(() =>
        [
          ...document.querySelectorAll<HTMLElement>(
            '.de-document-editor__content .pm-page-content .de-embed-inline',
          ),
        ].map((element) => {
          const rects = [...element.getClientRects()].filter((rect) => rect.width > 0);
          // The first letter after it, in the next text the page draws, past any spaces.
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          walker.currentNode = element.lastChild ?? element;
          let nextRect: DOMRect | undefined;
          for (let text = walker.nextNode(); text && !nextRect; text = walker.nextNode()) {
            const at = (text.textContent ?? '').search(/\S/u);
            if (at < 0) continue;
            const letter = document.createRange();
            letter.setStart(text, at);
            letter.setEnd(text, at + 1);
            nextRect = letter.getBoundingClientRect();
          }
          const top = rects[0]?.top ?? 0;
          return {
            lines: new Set(rects.map((rect) => Math.round(rect.top))).size,
            endsLine: nextRect ? nextRect.top > top + 4 : false,
          };
        }),
      );
      expect(placed.length).toBe(25);
      expect(placed.filter((each) => each.lines !== 1)).toEqual([]);
      expect(placed.some((each) => each.endsLine)).toBe(true);
    });
  });
});
