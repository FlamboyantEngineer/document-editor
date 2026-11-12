import type { Page } from '@playwright/test';
import type { RegressionDocumentName } from '../labs/src/regression/regression-documents.js';
import type { FragmentEdge, RegressionProbe } from '../labs/src/regression/regression-probe.js';
import type { StressProbe } from '../labs/src/stress/stress-probe.js';
import type { DocumentFile, StoredNode } from '../src/model/index.js';
import { expect, test, waitForLab } from './fixtures.js';

// The pagination regression scenarios (specs/LABS.md DOCE-LABS-4): the regression set's documents
// laid out in the regression lab, read from the pages it draws and edited at their fragment
// boundaries. A scenario the editor does not pass yet is an expected failure naming its gap in the
// port plan (`expectedFailure`); when the gap's work lands, the scenario passes, Playwright reports
// the expected failure as passing unexpectedly, and its mark comes off.

declare global {
  interface Window {
    regressionLab: RegressionProbe;
    stressLab: StressProbe;
  }
}

/** Marks a scenario as failing until the gap it names is closed. */
function expectedFailure(gap: string, why: string) {
  test.info().annotations.push({ type: 'gap', description: `${gap}: ${why}` });
  test.fail(true, `${gap}: ${why}`);
}

async function openDocument(
  page: Page,
  name: RegressionDocumentName,
  { layout = 'page', projection = false }: { layout?: string; projection?: boolean } = {},
) {
  const shown = projection ? '&projection' : '';
  await page.goto(`regression.html?document=${name}&layout=${layout}${shown}`);
  await waitForLab(page);
}

// Waits for the pages to settle after a change: a moment for the change to reach the editor, then
// its layout state.
const settle = (page: Page) =>
  page.evaluate(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return window.stressLab.whenSettled();
  });

// ---------------------------------------------------------------------------------------------
// Reading the pages

/** A heading on a page, its number as the reference stylesheet draws it before its text. */
interface HeadingRead {
  readonly level: number;
  readonly label: string;
  readonly text: string;
}

/** A block at the top level of a page's content. */
interface BlockRead {
  readonly tag: string;
  readonly id: string | null;
  readonly part: number | null;
  /** How many lines the block's fragment shows on the page, for a paragraph. */
  readonly lines: number;
}

/** A page as the reader sees it. */
interface PageRead {
  readonly section: string | null;
  readonly width: number;
  readonly height: number;
  /** Whether the page's content runs past its bottom. */
  readonly overflows: boolean;
  readonly blocks: readonly BlockRead[];
  readonly headings: readonly HeadingRead[];
  /** The numbers of each ordered list fragment's items, as the stylesheet's counters draw them. */
  readonly lists: readonly { id: string | null; part: number; numbers: number[] }[];
  readonly tables: readonly {
    id: string | null;
    part: number;
    headerRows: number;
    bodyRows: string[];
    caption: string | null;
  }[];
  readonly code: readonly { id: string | null; part: number; lineStart: number; lines: string[] }[];
  /** The footnote marks in the page's text and its footnote entries, with their numbers. */
  readonly footnoteMarks: readonly { id: string; number: string }[];
  readonly footnoteEntries: readonly { id: string; number: string }[];
  readonly header: string;
  readonly footer: string;
}

// Reads every page of the document editor. It runs in the page, so it holds everything it uses.
// Counters are followed in document order without nested scopes, which is how the reference
// stylesheet uses them; an ordered list's own counter is followed inside the list.
function readPages(): PageRead[] {
  const counters = new Map<string, number>();
  const pairs = (value: string, initial: number) => {
    const out: [string, number][] = [];
    const words = value === 'none' ? [] : value.trim().split(/\s+/);
    for (let index = 0; index < words.length; index += 1) {
      const name = words[index] ?? '';
      const next = Number(words[index + 1]);
      if (Number.isFinite(next) && words[index + 1] !== undefined && name !== '') {
        out.push([name, next]);
        index += 1;
      } else if (name !== '') out.push([name, initial]);
    }
    return out;
  };
  const apply = (style: CSSStyleDeclaration, into: Map<string, number>) => {
    for (const [name, value] of pairs(style.counterReset, 0)) into.set(name, value);
    for (const [name, value] of pairs(style.counterIncrement, 1))
      into.set(name, (into.get(name) ?? 0) + value);
    for (const [name, value] of pairs(style.counterSet, 0)) into.set(name, value);
  };
  const roman = (value: number) => {
    const numerals: [number, string][] = [
      [1000, 'm'],
      [900, 'cm'],
      [500, 'd'],
      [400, 'cd'],
      [100, 'c'],
      [90, 'xc'],
      [50, 'l'],
      [40, 'xl'],
      [10, 'x'],
      [9, 'ix'],
      [5, 'v'],
      [4, 'iv'],
      [1, 'i'],
    ];
    let rest = value;
    let out = '';
    for (const [amount, numeral] of numerals) {
      while (rest >= amount) {
        out += numeral;
        rest -= amount;
      }
    }
    return out;
  };
  const alpha = (value: number) => {
    let rest = value;
    let out = '';
    while (rest > 0) {
      rest -= 1;
      out = String.fromCharCode(97 + (rest % 26)) + out;
      rest = Math.floor(rest / 26);
    }
    return out;
  };
  const formatted = (value: number, style: string) => {
    // The reference stylesheet names its own counter styles after the built-in ones (`de-lower-roman`).
    if (style.endsWith('lower-roman')) return roman(value);
    if (style.endsWith('upper-roman')) return roman(value).toUpperCase();
    if (/lower-(alpha|latin)$/.test(style)) return alpha(value);
    if (/upper-(alpha|latin)$/.test(style)) return alpha(value).toUpperCase();
    return String(value);
  };
  const label = (content: string) => {
    if (content === 'none' || content === 'normal') return '';
    const tokens = content.matchAll(
      /"((?:[^"\\]|\\.)*)"|counter\(\s*([\w-]+)\s*(?:,\s*([\w-]+)\s*)?\)/g,
    );
    return [...tokens]
      .map(([, text, name, style]) =>
        name ? formatted(counters.get(name) ?? 0, style ?? 'decimal') : (text ?? ''),
      )
      .join('');
  };
  const content = document.querySelector('.de-document-editor__content');
  const headings = new Map<Element, string>();
  for (const element of content?.querySelectorAll('*') ?? []) {
    apply(getComputedStyle(element), counters);
    if (/^H[1-6]$/.test(element.tagName)) {
      apply(getComputedStyle(element, '::before'), counters);
      headings.set(element, label(getComputedStyle(element, '::before').content));
    }
  }
  const part = (element: Element) => Number(element.getAttribute('data-split-part-index') ?? 0);
  const listNumbers = (list: Element) => {
    const own = new Map<string, number>();
    apply(getComputedStyle(list), own);
    return [...list.children].map((item) => {
      apply(getComputedStyle(item), own);
      return own.get('ordered-list') ?? 0;
    });
  };
  const isHeaderRow = (row: Element) =>
    row.children.length > 0 && [...row.children].every((cell) => cell.tagName === 'TH');
  const text = (element: Element | null) => element?.textContent?.trim() ?? '';
  return [...(content?.querySelectorAll('.pm-page') ?? [])].map((page) => {
    const body = page.querySelector<HTMLElement>('.pm-page-content');
    const box = page.getBoundingClientRect();
    return {
      section: page.closest('.pm-section')?.getAttribute('data-section-name') ?? null,
      width: Math.round(box.width),
      height: Math.round(box.height),
      overflows: body ? body.scrollHeight > body.clientHeight + 1 : false,
      blocks: [...(body?.children ?? [])].map((block) => {
        const lineHeight = Number.parseFloat(getComputedStyle(block).lineHeight);
        return {
          tag: block.tagName.toLowerCase(),
          id: block.getAttribute('data-id'),
          part: block.hasAttribute('data-split-part-index') ? part(block) : null,
          lines:
            block.tagName === 'P' && lineHeight > 0
              ? Math.round(block.getBoundingClientRect().height / lineHeight)
              : 0,
        };
      }),
      headings: [...(body?.querySelectorAll('h1, h2, h3, h4, h5, h6') ?? [])].map((heading) => ({
        level: Number(heading.tagName.slice(1)),
        label: headings.get(heading) ?? '',
        text: text(heading),
      })),
      lists: [...(body?.querySelectorAll(':scope > ol') ?? [])].map((list) => ({
        id: list.getAttribute('data-id'),
        part: part(list),
        numbers: listNumbers(list),
      })),
      tables: [...(body?.querySelectorAll(':scope > table') ?? [])].map((table) => {
        const rows = [...table.querySelectorAll(':scope > tbody > tr, :scope > thead > tr')];
        return {
          id: table.getAttribute('data-id'),
          part: part(table),
          headerRows: rows.filter(isHeaderRow).length,
          bodyRows: rows
            .filter((row) => !isHeaderRow(row))
            .map((row) => row.getAttribute('data-id') ?? ''),
          caption: table.querySelector(':scope > caption')
            ? text(table.querySelector(':scope > caption'))
            : null,
        };
      }),
      code: [...(body?.querySelectorAll('pre') ?? [])].map((code) => ({
        id: code.getAttribute('data-id'),
        part: part(code),
        lineStart: Number(code.getAttribute('data-code-line-start') ?? 1),
        lines: (code.querySelector('code')?.textContent ?? code.textContent ?? '').split('\n'),
      })),
      footnoteMarks: [...(body?.querySelectorAll('sup[data-footnote-id]') ?? [])].map((mark) => ({
        id: mark.getAttribute('data-footnote-id') ?? '',
        number: text(mark),
      })),
      footnoteEntries: [...page.querySelectorAll('.pm-footnote-entry[data-footnote-id]')].map(
        (entry) => ({
          id: entry.getAttribute('data-footnote-id') ?? '',
          number: text(entry.querySelector('.pm-footnote-entry-number')),
        }),
      ),
      header: text(page.querySelector('.pm-page-header')),
      footer: text(page.querySelector('.pm-page-footer')),
    };
  });
}

const pagesOf = (page: Page) => page.evaluate(readPages);

/** A number in lower-case Roman numerals, up to 89. */
function roman(value: number): string {
  const numerals = [
    [50, 'l'],
    [40, 'xl'],
    [10, 'x'],
    [9, 'ix'],
    [5, 'v'],
    [4, 'iv'],
    [1, 'i'],
  ] as const;
  let rest = value;
  let out = '';
  for (const [amount, numeral] of numerals) {
    while (rest >= amount) {
      out += numeral;
      rest -= amount;
    }
  }
  return out;
}

/** Every page holds its content: none runs past its bottom. */
function expectPagesHoldContent(pages: readonly PageRead[]) {
  const overflowing = pages.flatMap((each, index) => (each.overflows ? [index + 1] : []));
  expect(overflowing, 'pages whose content runs past their bottom').toEqual([]);
}

// ---------------------------------------------------------------------------------------------
// Reading the stored document

const storedOf = (page: Page) =>
  page.evaluate(() => window.regressionLab.stored()) as Promise<DocumentFile>;

// The stored document without element ids, which a new element takes at random.
function withoutIds(file: DocumentFile): unknown {
  return JSON.parse(
    JSON.stringify(file, (key, value: unknown) =>
      key === 'id' || key === 'elementId' ? undefined : value,
    ),
  );
}

function storedNodes(file: DocumentFile, type: string): StoredNode[] {
  const found: StoredNode[] = [];
  const walk = (nodes: readonly StoredNode[]) => {
    for (const node of nodes) {
      if (node.type === type) found.push(node);
      walk(node.content ?? []);
    }
  };
  for (const section of file.sections) walk(section.content);
  return found;
}

// ---------------------------------------------------------------------------------------------
// Scenarios

const ALL_DOCUMENTS: readonly { name: RegressionDocumentName; pages: number }[] = [
  { name: 'blockquotes', pages: 2 },
  { name: 'code-blocks', pages: 3 },
  { name: 'empty-sections', pages: 3 },
  { name: 'footnote-heavy', pages: 4 },
  { name: 'footnotes-in-structures', pages: 1 },
  { name: 'heading-keep-with-next', pages: 4 },
  { name: 'long-bullet-list-with-nesting', pages: 2 },
  { name: 'long-mixed', pages: 20 },
  { name: 'long-ordered-list', pages: 3 },
  { name: 'mixed-geometry', pages: 6 },
  { name: 'mixed-geometry-repeated-sections', pages: 5 },
  { name: 'nested-lists', pages: 1 },
  { name: 'oversized-blocks', pages: 12 },
  { name: 'page-breaks-and-rules', pages: 4 },
  { name: 'roman-and-alpha-numbering', pages: 6 },
  { name: 'roman-numbering-stress', pages: 4 },
  { name: 'table-both-header-modes', pages: 8 },
  { name: 'table-long-headerless', pages: 8 },
  { name: 'table-long-repeated-header', pages: 10 },
  { name: 'table-long-single-header', pages: 10 },
  { name: 'table-merged-cells', pages: 1 },
  { name: 'table-rich-cells', pages: 1 },
];

test.describe('regression lab', () => {
  for (const { name, pages: least } of ALL_DOCUMENTS) {
    test(`DOCE-LABS-4.1 DOCE-PAGINATION-2.1 lays ${name} out on pages that hold their content`, async ({
      lab,
      page,
    }) => {
      await openDocument(page, name);
      const pages = await pagesOf(page);
      expect(pages.length).toBeGreaterThanOrEqual(least);
      expectPagesHoldContent(pages);
      await expect(page.getByRole('group', { name: 'Document status' })).toContainText(
        `of ${String(pages.length)}`,
      );
      expect(lab.errors).toEqual([]);
    });
  }

  test('DOCE-LABS-4.1 shows the document the Document picker names', async ({ lab, page }) => {
    await lab.open('regression');
    await page.getByRole('combobox', { name: 'Document' }).selectOption('long-ordered-list');
    await expect(page).toHaveURL(/document=long-ordered-list/);
    await expect(page.locator('.de-document-editor__content')).toContainText('Check 80:');
  });
});

// The edit matrix: the same key at the same place gives the same stored document whether the
// block is split across pages or shown whole in the web layout.
interface MatrixCell {
  readonly document: RegressionDocumentName;
  readonly type: string;
  readonly edge: FragmentEdge;
  readonly key: 'type' | 'Enter' | 'Backspace' | 'Delete';
  /** The gap and why, while the cell fails. */
  readonly fails?: string;
}

const BLOCKS: readonly { document: RegressionDocumentName; type: string; name: string }[] = [
  { document: 'oversized-blocks', type: 'paragraph', name: 'a paragraph' },
  { document: 'oversized-blocks', type: 'list_item', name: 'a list item' },
  { document: 'long-ordered-list', type: 'ordered_list', name: 'an ordered list' },
  { document: 'long-bullet-list-with-nesting', type: 'bullet_list', name: 'a nested list' },
  { document: 'table-long-repeated-header', type: 'table', name: 'a table with a repeated header' },
  { document: 'table-long-single-header', type: 'table', name: 'a table with one header' },
  { document: 'table-long-headerless', type: 'table', name: 'a table without a header' },
  { document: 'code-blocks', type: 'code_block', name: 'a code block' },
  { document: 'blockquotes', type: 'blockquote', name: 'a quote' },
];

const EDITS: readonly Pick<MatrixCell, 'edge' | 'key'>[] = [
  { edge: 'head-end', key: 'type' },
  { edge: 'continuation-start', key: 'type' },
  { edge: 'head-end', key: 'Enter' },
  { edge: 'continuation-start', key: 'Enter' },
  { edge: 'head-end', key: 'Delete' },
  { edge: 'continuation-start', key: 'Backspace' },
];

const PROJECTION = 'PG-40';
// The cells that fail today, by block type, edge and key, with what goes wrong.
const FAILING_CELLS: Readonly<Record<string, string>> = {
  'oversized-blocks paragraph head-end Enter': `${PROJECTION} (PG-29): Enter at a head fragment's end leaves an empty paragraph`,
  'oversized-blocks paragraph continuation-start Enter': `${PROJECTION} (PG-29): Enter at a continuation's start splits the fragments, not the paragraph`,
  'oversized-blocks list_item head-end Enter': `${PROJECTION} (PG-29): Enter at a split item's head fragment adds an empty item`,
  'long-ordered-list ordered_list head-end Delete': `${PROJECTION}: Delete at a split list's head end does not join the next item`,
  'long-ordered-list ordered_list continuation-start Backspace': `${PROJECTION}: Backspace at a list continuation's start joins the wrong items`,
  'long-bullet-list-with-nesting bullet_list continuation-start type': `${PROJECTION} (PG-03): the caret sits in the continuation's placeholder paragraph`,
  'long-bullet-list-with-nesting bullet_list continuation-start Enter': `${PROJECTION} (PG-03): the caret sits in the continuation's placeholder paragraph`,
  'long-bullet-list-with-nesting bullet_list head-end Delete': `${PROJECTION}: Delete at a nested list's head end does not join the next item`,
  'table-long-repeated-header table continuation-start type': `${PROJECTION} (PG-36): the caret sits in the repeated header row`,
  'table-long-repeated-header table continuation-start Enter': `${PROJECTION} (PG-36): the caret sits in the repeated header row`,
  'table-long-single-header table continuation-start type': `${PROJECTION}: the continuation's first row is no row of the stored table`,
  'table-long-single-header table continuation-start Enter': `${PROJECTION}: the continuation's first row is no row of the stored table`,
  'long-bullet-list-with-nesting bullet_list continuation-start Backspace': `${PROJECTION} (PG-03): the caret sits in the continuation's placeholder paragraph`,
  'table-long-repeated-header table continuation-start Backspace': `${PROJECTION} (PG-36): the caret sits in the repeated header row`,
  'table-long-single-header table continuation-start Backspace': `${PROJECTION}: the continuation's first row is no row of the stored table`,
  'oversized-blocks list_item continuation-start Enter': `SE-02: Enter at a block's start gives the moved text a new identity in the whole block`,
  'long-ordered-list ordered_list continuation-start Enter': `SE-02: Enter at a block's start gives the moved text a new identity in the whole block`,
  'table-long-headerless table continuation-start Enter': `SE-02: Enter at a block's start gives the moved text a new identity in the whole block`,
  'blockquotes blockquote continuation-start Enter': `SE-02: Enter at a block's start gives the moved text a new identity in the whole block`,
  'code-blocks code_block head-end Delete': `${PROJECTION}: the line break between two code fragments cannot be deleted`,
  'code-blocks code_block continuation-start Backspace': `${PROJECTION}: the line break between two code fragments cannot be deleted`,
};

async function press(page: Page, key: MatrixCell['key']) {
  if (key === 'type') await page.keyboard.type('ZQ');
  else await page.keyboard.press(key);
  await settle(page);
}

// The same key at a fragment boundary on the pages, then at the same place in the whole block.
async function editAcross(
  page: Page,
  {
    block,
    edit,
    projection,
  }: { block: (typeof BLOCKS)[number]; edit: (typeof EDITS)[number]; projection: boolean },
) {
  await openDocument(page, block.document, { projection });
  const caret = await page.evaluate(
    ([type, edge]) => window.regressionLab.caretAtFragment(type, edge),
    [block.type, edit.edge] as const,
  );
  expect(caret, `a split ${block.type}`).not.toBeNull();
  await press(page, edit.key);
  const paged = await storedOf(page);
  expectPagesHoldContent(await pagesOf(page));

  await openDocument(page, block.document, { layout: 'web' });
  const inText = await page.evaluate(
    (at) => window.regressionLab.caretAtJoined(at),
    caret?.joined ?? 0,
  );
  expect(inText, 'the caret is in a text block of the whole document').toBe(true);
  await press(page, edit.key);
  expect(withoutIds(paged)).toEqual(withoutIds(await storedOf(page)));
}

const cellOf = (block: (typeof BLOCKS)[number], edit: (typeof EDITS)[number]) =>
  `${block.document} ${block.type} ${edit.edge} ${edit.key}`;

const titleOf = (block: (typeof BLOCKS)[number], edit: (typeof EDITS)[number]) => {
  const where = edit.edge === 'head-end' ? "a head fragment's end" : "a continuation's start";
  return `${edit.key === 'type' ? 'types' : `presses ${edit.key}`} at ${where} of ${block.name} as in the whole block`;
};

test.describe('split-paragraph repagination matrix', () => {
  for (const block of BLOCKS) {
    for (const edit of EDITS) {
      test(`DOCE-LABS-4.2 DOCE-EDITING-2.4 DOCE-PAGINATION-3.5 ${titleOf(block, edit)}`, async ({
        page,
      }) => {
        const fails = FAILING_CELLS[cellOf(block, edit)];
        if (fails) expectedFailure(fails.split(' ')[0] ?? PROJECTION, fails);
        await editAcross(page, { block, edit, projection: false });
      });
    }
  }
});

// The failing cells the paged projection (PG-40) already passes, run on it while it is opt-in.
const PASSING_ON_PROJECTION = new Set([
  'oversized-blocks paragraph head-end Enter',
  'oversized-blocks paragraph continuation-start Enter',
  'oversized-blocks list_item head-end Enter',
  'oversized-blocks list_item continuation-start Enter',
  'long-ordered-list ordered_list head-end Delete',
  'long-ordered-list ordered_list continuation-start Backspace',
  'long-ordered-list ordered_list continuation-start Enter',
  'long-bullet-list-with-nesting bullet_list head-end Delete',
  'table-long-headerless table continuation-start Enter',
  'code-blocks code_block continuation-start Backspace',
  'blockquotes blockquote continuation-start Enter',
]);

test.describe('split-paragraph repagination matrix on the projection', () => {
  for (const block of BLOCKS) {
    for (const edit of EDITS) {
      if (!PASSING_ON_PROJECTION.has(cellOf(block, edit))) continue;
      test(`DOCE-LABS-4.2 DOCE-PAGINATION-7.17 ${titleOf(block, edit)} on the projection`, async ({
        page,
      }) => {
        await editAcross(page, { block, edit, projection: true });
      });
    }
  }
});

test.describe('list split stress', () => {
  test('DOCE-LABS-4.3 DOCE-PAGINATION-4.1 splits a long ordered list between items, each item once', async ({
    page,
  }) => {
    await openDocument(page, 'long-ordered-list');
    const pages = await pagesOf(page);
    const fragments = pages.flatMap((each) => each.lists);
    expect(fragments.length).toBeGreaterThan(1);
    expect(fragments.map(({ part }) => part)).toEqual(fragments.map((_, index) => index));
    expect(fragments.reduce((sum, { numbers }) => sum + numbers.length, 0)).toBe(80);
    expectPagesHoldContent(pages);
  });

  for (const projection of [false, true]) {
    test(`DOCE-LABS-4.3 DOCE-PAGINATION-4.1 numbers a split ordered list on from page to page${projection ? ' on the projection (DOCE-PAGINATION-7.17)' : ''}`, async ({
      page,
    }) => {
      await openDocument(page, 'long-ordered-list', { projection });
      const numbers = (await pagesOf(page)).flatMap((each) =>
        each.lists.flatMap((list) => list.numbers),
      );
      expect(numbers).toEqual(numbers.map((_, index) => index + 1));
    });
  }

  for (const name of ['long-bullet-list-with-nesting', 'oversized-blocks'] as const) {
    test(`DOCE-LABS-4.3 DOCE-PAGINATION-4.2 splits the lists of ${name} and shows every item`, async ({
      page,
    }) => {
      await openDocument(page, name);
      expectPagesHoldContent(await pagesOf(page));
      const stored = storedNodes(await storedOf(page), 'listItem').map((item) => item.attrs?.id);
      const shown = await page
        .locator('.de-document-editor__content li[data-id]')
        .evaluateAll((all) => all.map((item) => item.getAttribute('data-id')));
      expect(new Set(shown)).toEqual(new Set(stored));
      expect(
        await page.locator('.de-document-editor__content li[data-split-part-index]').count(),
      ).toBeGreaterThan(0);
    });
  }

  test('DOCE-LABS-4.3 DOCE-PAGINATION-4.3 draws no empty line where a split item continues', async ({
    page,
  }) => {
    expectedFailure('PG-03', "a list item's continuation placeholder is drawn as an empty line");
    await openDocument(page, 'long-bullet-list-with-nesting');
    const empty = await page
      .locator('.de-document-editor__content li[data-orphaned-list-continuation] > p:first-child')
      .evaluateAll(
        (all) =>
          all.filter((each) => !each.textContent && each.getBoundingClientRect().height > 0).length,
      );
    expect(empty).toBe(0);
  });
});

test.describe('table fragment stress', () => {
  const tableFragments = async (page: Page, name: RegressionDocumentName) => {
    await openDocument(page, name);
    const pages = await pagesOf(page);
    expectPagesHoldContent(pages);
    return pages.flatMap((each) => each.tables).filter(({ bodyRows }) => bodyRows.length > 0);
  };

  for (const { name, rows, header } of [
    { name: 'table-long-repeated-header', rows: 150, header: 'every' },
    { name: 'table-long-single-header', rows: 150, header: 'first' },
    { name: 'table-long-headerless', rows: 120, header: 'none' },
  ] as const) {
    test(`DOCE-LABS-4.4 DOCE-PAGINATION-4.5 splits ${name} between rows, each row once, the header on ${header === 'every' ? 'every page' : header === 'first' ? 'the first page' : 'no page'}`, async ({
      page,
    }) => {
      if (header === 'first') {
        expectedFailure(
          'DC-18',
          "the editor reads repeatHeader from the template's own styles, not the section's",
        );
      }
      const fragments = await tableFragments(page, name);
      expect(fragments.length).toBeGreaterThan(3);
      const ids = fragments.flatMap(({ bodyRows }) => bodyRows);
      expect(ids.length).toBe(new Set(ids).size);
      expect(ids.length).toBeGreaterThanOrEqual(rows);
      expect(fragments.map(({ headerRows }) => headerRows)).toEqual(
        fragments.map((_, index) =>
          header === 'every' || (header === 'first' && index === 0) ? 1 : 0,
        ),
      );
    });
  }

  test('DOCE-LABS-4.4 DOCE-PAGINATION-4.5 repeats the caption on continuations without a repeated header', async ({
    page,
  }) => {
    const fragments = await tableFragments(page, 'table-long-single-header');
    const captions = fragments.map(({ caption }) => caption);
    expect(captions.every((caption) => caption !== null && caption.length > 0)).toBe(true);
  });

  test('DOCE-LABS-4.4 lays out both header modes, merged cells and rich cells', async ({
    page,
  }) => {
    const both = await tableFragments(page, 'table-both-header-modes');
    expect(new Set(both.map(({ id }) => id)).size).toBe(2);
    for (const name of ['table-merged-cells', 'table-rich-cells'] as const) {
      expect((await tableFragments(page, name)).length).toBeGreaterThan(0);
    }
  });
});

test.describe('code block stress', () => {
  test('DOCE-LABS-4.5 DOCE-PAGINATION-3.3 splits a long listing at line breaks, each line once and numbered on', async ({
    page,
  }) => {
    await openDocument(page, 'code-blocks');
    const pages = await pagesOf(page);
    expectPagesHoldContent(pages);
    const fragments = pages.flatMap((each) => each.code).filter(({ lines }) => lines.length > 40);
    expect(fragments.length).toBeGreaterThan(1);
    let next = 1;
    const lines: string[] = [];
    for (const fragment of fragments) {
      expect(fragment.lineStart).toBe(next);
      next += fragment.lines.length;
      lines.push(...fragment.lines);
    }
    expect(lines.filter((line) => line.includes('reading = sensor.read'))).toHaveLength(150);
  });

  test('DOCE-LABS-4.5 DOCE-PAGINATION-4.4 splits a quoted code block longer than a page', async ({
    page,
  }) => {
    await openDocument(page, 'oversized-blocks');
    const pages = await pagesOf(page);
    expectPagesHoldContent(pages);
    const quoted = await page
      .locator('.de-document-editor__content blockquote pre[data-split-part-index]')
      .count();
    expect(quoted).toBeGreaterThan(1);
  });
});

test.describe('blockquote split', () => {
  test('DOCE-LABS-4.6 DOCE-PAGINATION-4.4 splits a quote of twelve paragraphs and keeps each paragraph once', async ({
    page,
  }) => {
    await openDocument(page, 'blockquotes');
    expectPagesHoldContent(await pagesOf(page));
    const parts = await page
      .locator('.de-document-editor__content .pm-page-content > blockquote[data-split-part-index]')
      .evaluateAll((all) =>
        all.map((quote) => ({
          id: quote.getAttribute('data-id'),
          paragraphs: [...quote.querySelectorAll(':scope > p')].map(
            (paragraph) =>
              `${paragraph.getAttribute('data-id') ?? ''} ${paragraph.getAttribute('data-split-part-index') ?? '0'}`,
          ),
        })),
      );
    expect(parts.length).toBeGreaterThan(1);
    expect(new Set(parts.map(({ id }) => id)).size).toBe(1);
    const shown = parts.flatMap(({ paragraphs }) => paragraphs);
    expect(shown.length).toBe(new Set(shown).size);
    const stored = storedNodes(await storedOf(page), 'blockquote').find(
      (quote) => (quote.content?.length ?? 0) >= 12,
    );
    expect(stored?.content?.length).toBe(12);
  });
});

test.describe('heading keep-with-next', () => {
  test('DOCE-LABS-4.7 DOCE-PAGINATION-2.5 ends no page with a heading', async ({ page }) => {
    await openDocument(page, 'heading-keep-with-next');
    const pages = await pagesOf(page);
    expectPagesHoldContent(pages);
    const ending = pages.flatMap((each, index) =>
      /^h[1-6]$/.test(each.blocks.at(-1)?.tag ?? '') ? [index + 1] : [],
    );
    expect(ending).toEqual([]);
  });

  test('DOCE-LABS-4.7 DOCE-PAGINATION-2.5 keeps two lines of the paragraph a heading leads', async ({
    page,
  }) => {
    await openDocument(page, 'heading-keep-with-next');
    const pages = await pagesOf(page);
    const short = pages.flatMap((each, index) =>
      each.blocks.flatMap((block, at) => {
        const next = each.blocks[at + 1];
        const led = /^h[1-6]$/.test(block.tag) && next?.tag === 'p' && next.part === 0;
        return led && next.lines < 2 ? [`page ${String(index + 1)}`] : [];
      }),
    );
    expect(short).toEqual([]);
  });

  test('DOCE-LABS-4.7 DOCE-PAGINATION-2.5 keeps a heading with the first rows of the table it leads', async ({
    page,
  }) => {
    await openDocument(page, 'heading-keep-with-next');
    const pages = await pagesOf(page);
    const alone = pages.flatMap((each, index) => {
      const last = each.blocks.at(-1);
      const before = each.blocks.at(-2);
      return last?.tag === 'table' &&
        /^h[1-6]$/.test(before?.tag ?? '') &&
        each.tables.at(-1)?.bodyRows.length === 0
        ? [index + 1]
        : [];
    });
    expect(alone).toEqual([]);
  });
});

test.describe('pagination corner cases', () => {
  test('DOCE-LABS-4.8 DOCE-PAGINATION-2.4 starts a new page at every page break, two in a row included', async ({
    page,
  }) => {
    await openDocument(page, 'page-breaks-and-rules');
    const pages = await pagesOf(page);
    expectPagesHoldContent(pages);
    const breaks = await page.locator('.de-document-editor__content hr[data-page-break]').count();
    expect(pages.length).toBeGreaterThanOrEqual(breaks + 1);
  });

  test('DOCE-LABS-4.8 DOCE-PAGINATION-3.1 fills every page an oversized paragraph runs over', async ({
    page,
  }) => {
    await openDocument(page, 'oversized-blocks');
    const pages = await pagesOf(page);
    const parts = pages.filter((each) =>
      each.blocks.some((block) => block.tag === 'p' && (block.part ?? 0) > 0),
    );
    expect(parts.length).toBeGreaterThan(1);
    expectPagesHoldContent(pages);
  });

  test('DOCE-LABS-4.8 gives every empty section one page of its own size', async ({ page }) => {
    await openDocument(page, 'empty-sections');
    const pages = await pagesOf(page);
    expect(pages.map(({ section }) => section)).toEqual(['cover', 'body', 'appendix']);
  });

  for (const projection of [false, true]) {
    test(`DOCE-LABS-4.8 DOCE-PAGINATION-8.2 fills the page number and count into each footer${projection ? ' on the projection (DOCE-PAGINATION-7.17)' : ''}`, async ({
      page,
    }) => {
      await openDocument(page, 'long-mixed', { projection });
      const pages = await pagesOf(page);
      expect(pages.map(({ footer }) => footer)).toEqual(
        pages.map((_, index) => `Page ${String(index + 1)} of ${String(pages.length)}`),
      );
    });
  }

  test('DOCE-LABS-4.8 DOCE-PAGINATION-6.6 lays a long mixed document out again after an edit and its undo', async ({
    page,
  }) => {
    await openDocument(page, 'long-mixed');
    const before = await pagesOf(page);
    await page.evaluate(() => window.regressionLab.caretAtFragment('paragraph', 'head-end'));
    await page.keyboard.type(' More notes were taken here, and kept with the others.'.repeat(8));
    await settle(page);
    expectPagesHoldContent(await pagesOf(page));
    await page.keyboard.press('ControlOrMeta+z');
    await settle(page);
    const after = await pagesOf(page);
    expectPagesHoldContent(after);
    expect(after.length).toBe(before.length);
  });
});

test.describe('footnote stress', () => {
  for (const name of ['footnote-heavy', 'footnotes-in-structures'] as const) {
    test(`DOCE-LABS-4.9 DOCE-PAGINATION-7.2 puts each footnote of ${name} on the page that marks it`, async ({
      page,
    }) => {
      await openDocument(page, name);
      const pages = await pagesOf(page);
      expectPagesHoldContent(pages);
      const misplaced = pages.flatMap((each, index) => {
        const marks = each.footnoteMarks.map(({ id }) => id).sort();
        const entries = each.footnoteEntries.map(({ id }) => id).sort();
        return JSON.stringify(marks) === JSON.stringify(entries) ? [] : [index + 1];
      });
      expect(misplaced).toEqual([]);
      expect(pages.flatMap((each) => each.footnoteMarks).length).toBeGreaterThan(0);
    });
  }

  test('DOCE-LABS-4.9 numbers footnotes per page when the template says so, mark and entry alike', async ({
    page,
  }) => {
    await openDocument(page, 'footnote-heavy');
    const pages = await pagesOf(page);
    for (const each of pages) {
      expect(each.footnoteMarks.map(({ number }) => number)).toEqual(
        each.footnoteMarks.map((_, index) => String(index + 1)),
      );
      expect(each.footnoteEntries.map(({ number }) => number.replace(/\D/g, ''))).toEqual(
        each.footnoteMarks.map(({ number }) => number),
      );
    }
  });
});

test.describe('mixed geometry', () => {
  // A5 portrait, US Legal portrait and A4 landscape at 96 pixels to the inch.
  const SIZES = { cover: [559, 794], body: [816, 1344], appendix: [1123, 794] } as const;

  test('DOCE-LABS-4.10 lays each section out on pages of its own size, in order', async ({
    page,
  }) => {
    await openDocument(page, 'mixed-geometry');
    const pages = await pagesOf(page);
    expectPagesHoldContent(pages);
    const sections = pages.map(({ section }) => section);
    expect([...new Set(sections)]).toEqual(['cover', 'body', 'appendix']);
    for (const each of pages) {
      expect([each.width, each.height]).toEqual(SIZES[each.section as keyof typeof SIZES]);
    }
  });

  test('DOCE-LABS-4.10 restarts the appendix numbering as A. and A.1, each time it repeats', async ({
    page,
  }) => {
    await openDocument(page, 'mixed-geometry-repeated-sections');
    const pages = await pagesOf(page);
    expectPagesHoldContent(pages);
    const appendices = pages.filter(({ section }) => section === 'appendix');
    expect(appendices.length).toBeGreaterThanOrEqual(3);
    const firsts = appendices
      .map((each) => each.headings.find(({ level }) => level === 1)?.label ?? null)
      .filter((label) => label !== null);
    expect(firsts.length).toBeGreaterThanOrEqual(3);
    for (const label of firsts) expect(label).toMatch(/A\. $/);
  });

  test('DOCE-LABS-4.10 numbers headings in Roman and alphabetic numerals across pages', async ({
    page,
  }) => {
    await openDocument(page, 'roman-numbering-stress');
    const headings = (await pagesOf(page))
      .filter(({ section }) => section === 'front_matter')
      .flatMap((each) => each.headings);
    expect(headings.length).toBe(60);
    let chapter = 0;
    let part = 0;
    const expected = headings.map(({ level }) => {
      if (level === 1) {
        chapter += 1;
        part = 0;
        return `${roman(chapter)}. `;
      }
      part += 1;
      return `${roman(chapter)}.${String.fromCharCode(96 + part)} `;
    });
    expect(headings.map(({ label }) => label)).toEqual(expected);
  });

  test('DOCE-LABS-4.10 numbers the Roman body and the alphabetic annex of one document', async ({
    page,
  }) => {
    await openDocument(page, 'roman-and-alpha-numbering');
    const pages = await pagesOf(page);
    expectPagesHoldContent(pages);
    const bySection = new Map<string, string[]>();
    for (const each of pages) {
      const labels = each.headings
        .filter(({ level }) => level === 1)
        .map(({ label }) => label.trim());
      bySection.set(each.section ?? '', [...(bySection.get(each.section ?? '') ?? []), ...labels]);
    }
    const body = [...bySection.entries()].find(([, labels]) => labels.includes('XXV.'));
    expect(body?.[1].slice(0, 3)).toEqual(['I.', 'II.', 'III.']);
    const annex = [...bySection.values()].find((labels) => labels[0]?.startsWith('A'));
    expect(annex?.[0]).toMatch(/^A/);
  });
});
