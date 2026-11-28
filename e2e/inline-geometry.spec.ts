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
  test('DOCE-PAGINATION-14.2 DOCE-PAGINATION-14.3 draws a signature in the box its rule gave it, on the engine’s lines', async ({
    page,
  }) => {
    type Stored = DocumentFile['sections'][number]['content'][number];
    const vector = {
      viewBox: { width: 200, height: 80 },
      paths: [{ d: 'M 10 10 L 190 70', fill: false, strokeWidth: 2 }],
    };
    const signature = (label: string, signed: boolean) =>
      ({
        type: 'signature',
        attrs: { person: 'u1', label, ...(signed ? { vector } : {}) },
      }) as Stored;
    const words = (value: string) => ({ type: 'text', text: value }) as Stored;
    const content = [
      {
        type: 'paragraph',
        content: [words('Signed by '), signature('Ann Lee', true), words(' on the day.')],
      },
      {
        type: 'paragraph',
        content: [words('To sign: '), signature('A reviewer with a long name to sign', false)],
      },
    ] as Stored[];
    await page.goto('regression.html?document=minimal-paragraph&debug');
    await waitForLab(page);
    const file = { formatVersion: 1, sections: [{ name: null, content }] } as DocumentFile;
    await page.evaluate((stored) => window.regressionLab.load(stored), file);
    await page.waitForFunction(() => window.regressionLab.layout() !== null);
    await page.evaluate(() => window.regressionLab.drawAllLines(true));
    await expect.poll(() => page.evaluate(() => window.regressionLab.wrappedLines())).toEqual([]);
    expect(await offPlan(page)).toEqual([]);
    const boxes = await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          '.de-document-editor__content .pm-page-content .de-signature',
        ),
      ].map((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const length = (name: string) => parseFloat(style.getPropertyValue(name));
        return {
          box: element.dataset.objectBox,
          width: Math.abs(rect.width - length('--de-object-width')) < 0.5,
          height: Math.abs(rect.height - length('--de-object-height')) < 0.5,
        };
      }),
    );
    expect(boxes).toEqual([
      { box: 'inline', width: true, height: true },
      { box: 'inline', width: true, height: true },
    ]);
  });

  // Lines that mix fonts of other metrics, at a tight line height, so each line's box is its
  // tallest font's: the struts the engine builds them from round as the browser's do on every
  // system it runs on (the weekly macOS and Windows run, `.github/workflows/systems.yml`).
  test('DOCE-PAGINATION-9.5 grows lines that mix fonts as the browser does', async ({ page }) => {
    await open(page);
    const words = 'The keepers note each reading with its units and the counts of the beds';
    const code = (text: string) => ({ type: 'text', text, marks: [{ type: 'code' }] });
    const mixed = (id: string, extra: Record<string, unknown>[]) => ({
      type: 'paragraph',
      attrs: { id },
      content: [
        { type: 'text', text: `${words} ` },
        code('gauge_17'),
        { type: 'text', text: ` and ${words}, ` },
        { type: 'text', text: 'bold', marks: [{ type: 'strong' }] },
        { type: 'text', text: ' or ' },
        { type: 'text', text: 'slanted', marks: [{ type: 'em' }] },
        ...extra,
        { type: 'text', text: ` ${words}.` },
      ],
    });
    const file = {
      formatVersion: 1,
      template: { id: 'mixed-fonts' },
      sections: [
        {
          name: 'body',
          content: [
            {
              type: 'heading',
              attrs: { id: 'h1' },
              content: [{ type: 'text', text: 'Readings beside ' }, code('north_gate')],
            },
            mixed('p1', []),
            mixed('p2', [{ type: 'text', text: ' ' }, code('rain_mm')]),
          ],
        },
      ],
    };
    const fonts = (lineHeight: number) => ({
      formatVersion: 1,
      id: 'mixed-fonts',
      page: { size: 'A5', orientation: 'portrait' },
      styles: {
        paragraph: { font: 'Lab Geist', size: '11pt', lineHeight },
        heading1: { font: 'Times New Roman', size: '17pt' },
        codeBlock: { font: 'Courier New', size: '14pt' },
      },
      sections: [{ name: 'body', label: 'Body', required: true }],
    });
    for (const lineHeight of [1, 1.15, 1.5]) {
      await page.evaluate(
        ([stored, template]) => {
          window.regressionLab.load(stored as DocumentFile, template as never);
        },
        [file, fonts(lineHeight)] as const,
      );
      await waitForLab(page);
      await page.evaluate(() => window.regressionLab.drawAllLines(true));
      await expect(page.locator('.pm-page-content > p[data-lines]')).toHaveCount(2);
      expect(await page.evaluate(() => window.regressionLab.wrappedLines())).toEqual([]);
      expect([lineHeight, await offPlan(page)]).toEqual([lineHeight, []]);
      // The code raises the lines it is on above the paragraph's own line height.
      const grown = await page.evaluate(
        (leading) =>
          [...document.querySelectorAll<HTMLElement>('.pm-page-content > p[data-lines]')].map(
            (block) =>
              Number(block.dataset.debugHeight) > Number(block.dataset.lines) * leading + 0.5,
          ),
        (11 * 4 * lineHeight) / 3,
      );
      expect(grown).toEqual([true, true]);
    }
  });

  test('DOCE-PAGINATION-12.4 draws a heading number and a caption label in the boxes the engine reserved for their unserved clusters', async ({
    page,
  }) => {
    await page.goto('regression.html?document=minimal-paragraph&debug');
    await waitForLab(page);
    // Devanagari, which no lab font serves, in a heading's number and a table's caption label:
    // the browser's fallback draws it at a width nothing predicts, the engine gives it 1 em.
    const cell = (text: string) => ({
      type: 'tableCell',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    });
    const file = {
      formatVersion: 1,
      template: { id: 'unserved-numbers' },
      sections: [
        {
          name: 'body',
          content: [
            { type: 'heading', attrs: { id: 'h1' }, content: [{ type: 'text', text: 'Scope' }] },
            {
              type: 'table',
              attrs: { id: 't1' },
              content: [
                { type: 'caption', content: [{ type: 'text', text: 'Readings' }] },
                { type: 'tableRow', content: [cell('a'), cell('b')] },
              ],
            },
          ],
        },
      ],
    };
    const template = {
      formatVersion: 1,
      id: 'unserved-numbers',
      page: { size: 'A5', orientation: 'portrait' },
      styles: {
        heading1: { numbering: { format: '1', prefix: 'कक ', suffix: ' ' } },
        table: { numbering: { format: '1', prefix: 'कक ', suffix: ' - ' } },
      },
      sections: [{ name: 'body', label: 'Body', required: true }],
    };
    await page.evaluate(
      ([stored, own]) => {
        window.regressionLab.load(stored as DocumentFile, own as never);
      },
      [file, template] as const,
    );
    await waitForLab(page);
    await page.evaluate(() => window.regressionLab.drawAllLines(true));
    const heading = page.locator('.de-document-editor__content .pm-page-content > h1');
    await expect(heading).toHaveClass(/de-forced-lines/);
    // Where the content's first character starts after the number, from the block's own left
    // edge, against the number's width with each unserved cluster at 1 em of the block's font.
    const starts = await page.evaluate(() =>
      ['.pm-page-content > h1', '.pm-page-content .doc-caption-text'].map((selector) => {
        const block = document.querySelector<HTMLElement>(
          `.de-document-editor__content ${selector}`,
        );
        const label = block?.querySelector<HTMLElement>('.de-forced-lines__label');
        if (!block || !label) return null;
        const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
        let first: Text | null = null;
        for (let node = walker.nextNode(); node; node = walker.nextNode())
          if (!label.contains(node) && node.textContent) {
            first = node as Text;
            break;
          }
        if (!first) return null;
        const range = document.createRange();
        range.setStart(first, 0);
        range.setEnd(first, 1);
        const style = getComputedStyle(label);
        const context = document.createElement('canvas').getContext('2d');
        if (!context) return null;
        context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const served = (label.textContent ?? '').replace(/\p{Script=Devanagari}/gu, '');
        const expected = context.measureText(served).width + 2 * parseFloat(style.fontSize);
        const drawn = range.getBoundingClientRect().left - label.getBoundingClientRect().left;
        return {
          boxes: label.querySelectorAll('.de-forced-lines__reserved').length,
          expected,
          drawn,
        };
      }),
    );
    for (const start of starts) {
      expect(start?.boxes).toBe(2);
      expect(Math.abs((start?.drawn ?? 0) - (start?.expected ?? 1))).toBeLessThan(0.1);
    }
    expect(await page.evaluate(() => window.regressionLab.wrappedLines())).toEqual([]);
    expect(await offPlan(page)).toEqual([]);
  });

  test('DOCE-PAGINATION-9.5 wraps a long variable value in a header and in the text on the engine’s lines', async ({
    page,
  }) => {
    await page.goto('regression.html?document=minimal-paragraph&debug');
    await waitForLab(page);
    const title =
      'A very long document title that a writer gave the report, with  two spaces, to see where it wraps';
    const variable = { type: 'variable', attrs: { key: 'document.title' } };
    const words = (value: string) => ({ type: 'text', text: value });
    const line = (...content: unknown[]) => ({ type: 'paragraph', content });
    const file = {
      formatVersion: 1,
      template: { id: 'long-values' },
      values: { 'document.title': title, 'document.owner': 'Line one\nLine two' },
      sections: [
        {
          name: 'body',
          content: [
            line(words('Report: '), variable, words(' (draft)')),
            line(
              words('Owner: '),
              { type: 'variable', attrs: { key: 'document.owner' } },
              words('.'),
            ),
          ],
        },
      ],
    };
    const template = {
      formatVersion: 1,
      id: 'long-values',
      page: { size: 'A6', orientation: 'portrait' },
      header: { content: [line(words('Report: '), variable, words(' (draft)'))] },
      sections: [{ name: 'body', label: 'Body', required: true }],
    };
    await page.evaluate(
      ([stored, own]) => {
        window.regressionLab.load(stored as DocumentFile, own as never);
      },
      [file, template] as const,
    );
    await waitForLab(page);
    await page.evaluate(() => window.regressionLab.drawAllLines(true));
    // Each block the value is in is drawn on as many lines as the engine laid it out on, its
    // value broken between two of its words where the engine broke it.
    const drawn = await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          '.de-document-editor__content :is(.pm-page-header, .pm-page-content) p.de-forced-lines',
        ),
      ].map((block) => ({
        lines: Number(block.dataset.lines),
        breaks: block.querySelectorAll('[data-template-variable] .de-forced-lines__break').length,
      })),
    );
    expect(drawn.length).toBeGreaterThanOrEqual(3);
    // The title takes more than one line in the header and in the text.
    expect(drawn.filter((block) => block.lines > 2 && block.breaks > 0).length).toBeGreaterThan(1);
    expect(await page.evaluate(() => window.regressionLab.wrappedLines())).toEqual([]);
    expect(await offPlan(page)).toEqual([]);
    // The header's drawn height is the room the layout gave it.
    const header = await page.evaluate(() => {
      const region = document.querySelector<HTMLElement>(
        '.de-document-editor__content .pm-page-header',
      );
      const block = region?.querySelector<HTMLElement>('p.de-forced-lines');
      return {
        lines: Number(block?.dataset.lines),
        height: block?.getBoundingClientRect().height ?? 0,
        line: parseFloat(getComputedStyle(block ?? document.body).lineHeight),
      };
    });
    expect(header.lines).toBeGreaterThan(2);
    expect(Math.abs(header.height - header.lines * header.line)).toBeLessThan(0.5);
  });

  test('DOCE-PAGINATION-9.5 draws a text atom’s white space collapsed, as the engine lays it out', async ({
    page,
  }) => {
    await page.goto('regression.html?document=minimal-paragraph&debug');
    await waitForLab(page);
    const values = ['ab', 'a b', 'a  b', 'a\tb', 'a\nb', 'a', ' a '];
    const content = values.map((value) => ({
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Value ' },
        { type: 'embed_inline', attrs: { kind: 'cell', source: 'book!B2', text: value } },
        { type: 'text', text: ' here.' },
      ],
    }));
    const file = { formatVersion: 1, sections: [{ name: null, content }] } as DocumentFile;
    await page.evaluate((stored) => window.regressionLab.load(stored), file);
    await waitForLab(page);
    await page.evaluate(() => window.regressionLab.drawAllLines(true));
    const widths = await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          '.de-document-editor__content .pm-page-content > p span[data-embed-kind]',
        ),
      ].map((embed) => embed.getBoundingClientRect().width),
    );
    const [ab = 0, spaced = 0, two, tab, feed, a = 0, ends = 0] = widths;
    const space = spaced - ab;
    expect(space).toBeGreaterThan(1);
    for (const width of [two, tab, feed])
      expect(Math.abs((width ?? 0) - spaced)).toBeLessThan(0.05);
    expect(Math.abs(ends - (a + 2 * space))).toBeLessThan(0.05);
    expect(await page.evaluate(() => window.regressionLab.wrappedLines())).toEqual([]);
    expect(await offPlan(page)).toEqual([]);
  });
});
