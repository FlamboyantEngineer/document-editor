import type { Page } from '@playwright/test';
import type { RegressionProbe } from '../labs/src/regression/regression-probe.js';
import { printSnapshot } from '../src/document/index.js';
import type { DocumentFile, TemplateFile } from '../src/model/index.js';
import { expect, test, waitForLab } from './fixtures.js';

// Equations on the engine's lines (specs/PAGINATION.md DOCE-PAGINATION-10.8, 13.1, 13.2, 13.3):
// math the typesetter is slow with keeps the pages provisional until it is typeset and is laid out
// at its typeset size, or stops being waited for once removed; a line that ends right after inline
// math breaks there in the editor, the viewer and a print drawn from the layout; and both static
// drawings show the typeset MathML the editor shows, at its sizes.

declare global {
  interface Window {
    regressionLab: RegressionProbe;
  }
}

type Stored = DocumentFile['sections'][number]['content'][number];

const text = (value: string): Stored => ({ type: 'text', text: value }) as Stored;
const math = (source: string): Stored => ({ type: 'math', attrs: { source } }) as Stored;
const paragraph = (...content: Stored[]): Stored => ({ type: 'paragraph', content }) as Stored;
const documentOf = (...content: Stored[]): DocumentFile =>
  ({ formatVersion: 1, sections: [{ name: null, content }] }) as DocumentFile;

// A thirteen-row matrix, much taller than the source drawn while it is typeset.
const TALL = `\\begin{matrix}${Array.from({ length: 13 }, (_, row) => String(row + 1)).join('\\\\')}\\end{matrix}`;

// The editor's pages, the read-only viewer's and a print's.
const EDITOR =
  ':not(.de-document-viewer) > .de-document-editor__content:not(.de-document-editor__measure *)';
const VIEWER = '.de-document-viewer';
const PRINTED = 'body';
const MATH = `${EDITOR} .de-math`;
const ROOMY = { width: 1600, height: 1800 };

// An A6 page with a content area 60px wide.
const NARROW = {
  formatVersion: 1,
  id: 'narrow-equations',
  page: {
    size: 'A6',
    orientation: 'portrait',
    margins: { top: '20px', right: '168px', bottom: '20px', left: '169px' },
  },
} as TemplateFile;

async function load(page: Page, file: DocumentFile, template?: TemplateFile) {
  await page.goto('regression.html?document=minimal-paragraph&textLayout=pretext&debug');
  await waitForLab(page);
  await page.evaluate(([stored, own]) => window.regressionLab.load(stored, own), [
    file,
    template,
  ] as const);
  await page.waitForFunction(() => window.regressionLab.layout() !== null);
}

// Holds the typesetter's module until `release` is called, so math stays pending.
async function holdTypesetter(page: Page) {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/katex-*.js', async (route) => {
    await held;
    await route.continue();
  });
  return () => release();
}

const provisional = (page: Page) =>
  page.evaluate(() => window.regressionLab.layout()?.provisional ?? null);

// Each top-level block of the pages whose painted top, from its page content's top, or height is
// not the one its layout planned.
const offPlan = (page: Page) =>
  page.evaluate(
    (editor) =>
      [
        ...document.querySelectorAll<HTMLElement>(
          `${editor} .pm-page-content > [data-debug-height]`,
        ),
      ]
        .map((block) => {
          const content = block.parentElement?.getBoundingClientRect().top ?? 0;
          const box = block.getBoundingClientRect();
          return {
            type: block.dataset.debugType,
            top: [Number(block.dataset.debugTop), box.top - content],
            height: [Number(block.dataset.debugHeight), box.height],
          };
        })
        .filter(
          ({ top, height }) =>
            Math.abs((top[0] ?? 0) - (top[1] ?? 0)) > 0.5 ||
            Math.abs((height[0] ?? 0) - (height[1] ?? 0)) > 0.5,
        ),
    EDITOR,
  );

test.describe('equations on the engine’s lines', () => {
  test('DOCE-PAGINATION-10.8 keeps slow math provisional and lays it out at its typeset size', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const release = await holdTypesetter(page);
    await load(
      page,
      documentOf(
        paragraph(text('Before '), math(TALL), text(' after')),
        { type: 'mathBlock', attrs: { source: TALL } } as Stored,
        paragraph(text('Following paragraph')),
      ),
    );
    // Longer than the measurer waits for an image out of sight.
    await page.waitForTimeout(11_000);
    await expect(page.locator(MATH).first()).toHaveAttribute('data-state', 'pending');
    expect(await provisional(page)).toBe(true);
    release();
    await expect(page.locator(`${MATH}[data-state='ready']`)).toHaveCount(2);
    await expect.poll(() => provisional(page), { timeout: 15_000 }).toBe(false);
    const heights = await page
      .locator(MATH)
      .evaluateAll((each) =>
        each.map((element) => element.firstElementChild?.getBoundingClientRect().height ?? 0),
      );
    for (const height of heights) expect(height).toBeGreaterThan(150);
    await expect.poll(() => offPlan(page)).toEqual([]);
  });

  test('DOCE-PAGINATION-10.8 stops waiting for math removed while it is typeset', async ({
    page,
  }) => {
    await holdTypesetter(page);
    const latex = 'x^2';
    await load(page, documentOf(paragraph(math(latex), text(' after')), paragraph(text('next'))));
    await expect(page.locator(MATH).first()).toHaveAttribute('data-state', 'pending');
    expect(await provisional(page)).toBe(true);
    // The math node is its source and its two edges, at the start of the paragraph it is in.
    const size = latex.length + 2;
    const ranges = await page.evaluate(() => window.regressionLab.textRanges());
    const [from] = ranges.find(([start, end]) => end - start === size + ' after'.length) ?? [];
    if (from === undefined) throw new Error('no paragraph with the math');
    const change = { kind: 'delete', from, to: from + size } as const;
    await page.evaluate((each) => window.regressionLab.remote(each), change);
    await expect(page.locator(MATH)).toHaveCount(0);
    await expect.poll(() => provisional(page), { timeout: 5_000 }).toBe(false);
    await expect.poll(() => offPlan(page)).toEqual([]);
  });

  test('DOCE-PAGINATION-13.1 breaks a line right after inline math in the editor, the viewer and a print', async ({
    page,
  }) => {
    // A content area 60px wide: `a+b=c` fills the first line, `xxx` goes on the second.
    await load(page, documentOf(paragraph(math('a+b=c'), text('xxx'))), NARROW);
    await expect(page.locator(`${MATH}[data-state='ready']`)).toHaveCount(1);
    await expect.poll(() => provisional(page)).toBe(false);
    const lines = await page.evaluate(() =>
      window.regressionLab
        .textLines()
        .flatMap(({ blocks }) =>
          blocks.flatMap((block) => block.lines?.map(({ from, to }) => [from, to]) ?? []),
        ),
    );
    expect(lines).toEqual([
      [0, 7],
      [7, 10],
    ]);
    expect(await secondLineAfterMath(page, EDITOR)).toEqual({ lines: 2, xxx: 1 });
    await showViewer(page);
    expect(await secondLineAfterMath(page, VIEWER)).toEqual({ lines: 2, xxx: 1 });
    const printed = await printed_(page);
    expect(await secondLineAfterMath(printed, PRINTED)).toEqual({ lines: 2, xxx: 1 });
    await printed.close();
  });

  test('DOCE-PAGINATION-13.3 draws typeset math in the viewer and a print as the editor does', async ({
    page,
  }) => {
    await page.setViewportSize(ROOMY);
    await page.goto('regression.html?document=math&textLayout=pretext');
    await waitForLab(page);
    await page.evaluate(() => window.regressionLab.drawAllLines(true));
    await expect.poll(() => provisional(page)).toBe(false);
    const editor = await drawnMath(page, EDITOR);
    expect(editor.filter(({ state }) => state === 'ready')).toHaveLength(6);
    expect(editor.filter(({ structure }) => structure.includes('mfrac'))).toHaveLength(3);
    expect(new Set(editor.map(({ display }) => display))).toEqual(new Set(['inline', 'display']));
    await showViewer(page);
    expect(await drawnMath(page, VIEWER)).toEqual(editor);
    // The source is kept only as the MathML's annotation, which is not shown.
    expect(await page.locator(VIEWER).innerText()).not.toContain('\\frac');
    const printed = await printed_(page);
    expect(await drawnMath(printed, PRINTED)).toEqual(editor);
    await printed.close();
  });
});

// Shows the pages' layout in the read-only viewer, every page drawn.
async function showViewer(page: Page) {
  expect(await page.evaluate(() => window.regressionLab.showViewer())).toBe(true);
  const sheets = page.locator(`${VIEWER} .pm-page`);
  await expect(sheets.first()).toHaveAttribute('data-drawn', 'true');
}

// The pages drawn in a print of their layout, styled by the reference stylesheet, laid out for print.
async function printed_(page: Page) {
  const html = await page.evaluate(
    (href) => window.regressionLab.layoutPrint({ stylesheets: [href] }) ?? '',
    new URL('build/reference.css', page.url()).href,
  );
  const printed = await page.context().newPage();
  await printed.setViewportSize(ROOMY);
  const result = await printSnapshot(printed, html);
  if (!result.ok) throw new Error(`The print did not finish: ${result.reason}`);
  await printed.emulateMedia({ media: 'print' });
  return printed;
}

// In the pages under a root: how many lines the paragraph holding math is drawn on, and the line
// its text after the math starts on, counted from 0. Lines are told apart by where they start: the
// math's box and the text's character boxes, a new line wherever one starts below the last one's
// bottom, so the count does not depend on how tall the math makes a line.
const secondLineAfterMath = (page: Page, root: string) =>
  page.evaluate((under) => {
    const block = document.querySelector(`${under} .pm-page-content > p`);
    const after = block?.lastChild;
    const math = block?.querySelector('.de-math');
    if (!block || !math || !after || after.nodeType !== Node.TEXT_NODE)
      throw new Error('no paragraph');
    const boxOf = (offset: number) => {
      const range = document.createRange();
      range.setStart(after, offset);
      range.setEnd(after, offset + 1);
      return range.getBoundingClientRect();
    };
    const text = after.textContent ?? '';
    const boxes = [math.getBoundingClientRect(), ...Array.from(text, (_, offset) => boxOf(offset))];
    let lines = 1;
    let bottom = boxes[0]?.bottom ?? 0;
    let xxx = 0;
    boxes.forEach((box, index) => {
      if (index > 0 && box.top >= bottom - 0.5) {
        lines += 1;
        bottom = box.bottom;
      } else bottom = Math.max(bottom, box.bottom);
      if (index === 1) xxx = lines - 1;
    });
    return { lines, xxx };
  }, root);

// Each math element drawn in the pages under a root: inline or display, its state, its MathML's
// structure (each element's tag, nested) and its box.
const drawnMath = (page: Page, root: string) =>
  page.evaluate(
    (under) =>
      [...document.querySelectorAll<HTMLElement>(`${under} .pm-page-content .de-math`)].map(
        (element) => {
          const tree = (node: Element): string =>
            `${node.localName}(${[...node.children].map(tree).join(',')})`;
          const typeset = element.querySelector('math');
          const box = typeset?.getBoundingClientRect();
          const round = (value: number) => Math.round(value * 10) / 10;
          return {
            display: element.dataset.display,
            state: element.dataset.state,
            structure: typeset ? tree(typeset) : '',
            size: box ? [round(box.width), round(box.height)] : null,
          };
        },
      ),
    root,
  );
