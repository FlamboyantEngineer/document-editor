// The editor-versus-print gate (DOCE-EDITOR-6.19): each page the editor shows, against the same
// page of its snapshot as print lays it out, and the PDF print makes of the snapshot.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type BrowserContext, expect, type Locator, type Page, test } from '@playwright/test';

/** The share of a page's pixels that may differ between the editor and print. */
export const PIXEL_TOLERANCE = 0.005;

/** How one page compares. */
export interface PageComparison {
  readonly index: number;
  readonly differing: number;
  /** Where the differing pixels fall, as `left,top to right,bottom` in the page's pixels. */
  readonly box: string;
}

const content = (page: Page) => page.locator('.de-document-editor__content');

/** How much a pixel's luminance, out of 255, may differ from the closest one around it. */
const LUMINANCE_TOLERANCE = 48;

/** Where two images of a page differ, and in what share of its pixels. */
interface PixelDifference {
  readonly share: number;
  /** The box the differing pixels fall in, as `left,top to right,bottom`, or empty. */
  readonly box: string;
}

// The share of pixels of two same-scale PNGs that differ, by luminance: a pixel differs when
// neither image has a pixel close to it within one pixel around it, so anti-aliasing, the colour
// fringes of text drawn on sub-pixels and a sub-pixel offset between where the editor and print
// place a page do not count.
async function differingShare(
  page: Page,
  editor: Buffer,
  printed: Buffer,
): Promise<PixelDifference> {
  return page.evaluate(
    async ([a, b, tolerance]) => {
      const load = (data: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = `data:image/png;base64,${data}`;
        });
      const [first, second] = await Promise.all([load(a), load(b)]);
      const width = Math.min(first.width, second.width);
      const height = Math.min(first.height, second.height);
      const luminance = (image: HTMLImageElement) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('No 2D canvas.');
        context.drawImage(image, 0, 0);
        const { data } = context.getImageData(0, 0, width, height);
        const values = new Float32Array(width * height);
        for (let at = 0; at < values.length; at += 1) {
          values[at] =
            0.2126 * (data[at * 4] ?? 0) +
            0.7152 * (data[at * 4 + 1] ?? 0) +
            0.0722 * (data[at * 4 + 2] ?? 0);
        }
        return values;
      };
      const one = luminance(first);
      const two = luminance(second);
      const close = (own: Float32Array, other: Float32Array, x: number, y: number) => {
        const value = own[y * width + x] ?? 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            if (Math.abs(value - (other[ny * width + nx] ?? 0)) <= tolerance) return true;
          }
        }
        return false;
      };
      let differing = 0;
      const box = { left: width, top: height, right: 0, bottom: 0 };
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (close(one, two, x, y) && close(two, one, x, y)) continue;
          differing += 1;
          box.left = Math.min(box.left, x);
          box.top = Math.min(box.top, y);
          box.right = Math.max(box.right, x);
          box.bottom = Math.max(box.bottom, y);
        }
      }
      return {
        share: differing / (width * height),
        box: differing
          ? `${String(box.left)},${String(box.top)} to ${String(box.right)},${String(box.bottom)}`
          : '',
      };
    },
    [editor.toString('base64'), printed.toString('base64'), LUMINANCE_TOLERANCE] as const,
  );
}

// Each sheet of a PDF: its size in points, in page order.
function pdfSheets(pdf: Buffer): { width: number; height: number }[] {
  const boxes = pdf.toString('latin1').matchAll(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/g);
  return [...boxes].map(([, width = '0', height = '0']) => ({
    width: Number(width),
    height: Number(height),
  }));
}

// The words of a text: its runs of letters and digits.
const words = (text: string) => text.match(/[\p{L}\p{N}]+/gu) ?? [];

// The words of a page the sheet lacks. Print runs a stylesheet's generated text, such as
// numbers, leaders and list markers, into the words beside it, so the sheet is read as one run of
// characters; a word is looked for after the one before it, and then anywhere, since a PDF reader
// may take a table's cells or the page's regions in another order.
function missingWords(page: readonly string[], sheet: string): string[] {
  const run = words(sheet).join('');
  const missing: string[] = [];
  let from = 0;
  for (const word of page) {
    const next = run.indexOf(word, from);
    const at = next < 0 ? run.indexOf(word) : next;
    if (at < 0) missing.push(word);
    else from = at + word.length;
  }
  return missing;
}

// The text of each page of a PDF, by poppler's `pdftotext`, which the CI runner installs.
function pdfPageTexts(pdf: Buffer, pages: number): string[] {
  const dir = mkdtempSync(join(tmpdir(), 'print-fidelity-'));
  const file = join(dir, 'print.pdf');
  writeFileSync(file, pdf);
  return Array.from({ length: pages }, (_, index) => {
    const page = String(index + 1);
    execFileSync('pdftotext', ['-f', page, '-l', page, file, join(dir, `${page}.txt`)]);
    return readFileSync(join(dir, `${page}.txt`), 'utf8');
  });
}

// The text a page shows, in document order: each text node's text that is not clipped away by an
// element around it that clips what overflows it.
function visibleText(page: Element): string {
  const clips = (element: Element) => getComputedStyle(element).overflow !== 'visible';
  const shows = (node: Text) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    const box = range.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) return false;
    for (let around = node.parentElement; around; around = around.parentElement) {
      if (getComputedStyle(around).visibility === 'hidden') return false;
      if (around === page || clips(around)) {
        const edge = around.getBoundingClientRect();
        const inside =
          box.left < edge.right - 1 &&
          box.right > edge.left + 1 &&
          box.top < edge.bottom - 1 &&
          box.bottom > edge.top + 1;
        if (!inside) return false;
      }
      if (around === page) break;
    }
    return true;
  };
  const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node instanceof Text && shows(node)) parts.push(node.data);
  }
  return parts.join(' ');
}

// Moves each printed page by less than a pixel, so it sits at the same fraction of a pixel as the
// editor's page did: text is drawn snapped to the pixel grid from where its page sits, so pages
// at different fractions would draw it a pixel apart. Every page is read before any moves, since
// reading a page after another moved lays the whole printed document out again; a page moved
// relatively moves no other. Only the places go to the browser: the editor's screenshots would be
// serialized with them.
async function alignToEditor(
  pages: Locator,
  editor: { readonly x: number; readonly y: number }[],
): Promise<void> {
  await pages.evaluateAll((elements, places) => {
    const boxes = elements.map((element) => element.getBoundingClientRect());
    const fraction = (value: number) => value - Math.floor(value);
    const shift = (to: number, from: number) => fraction(fraction(to) - fraction(from));
    elements.forEach((element, index) => {
      const box = boxes[index];
      const { x, y } = places[index] ?? { x: 0, y: 0 };
      if (!box) return;
      Object.assign((element as HTMLElement).style, {
        position: 'relative',
        left: `${String(shift(x, box.x))}px`,
        top: `${String(shift(y, box.y))}px`,
      });
    });
  }, editor);
}

/**
 * Checks that print shows the editor's pages: the snapshot `snapshot` gives prints one sheet per
 * page, of the page's size, holding the page's text, and each page as print lays it out differs
 * from the editor's in at most `PIXEL_TOLERANCE` of its pixels.
 */
export async function expectPrintEqualsEditor(
  page: Page,
  context: BrowserContext,
  snapshot: () => Promise<string>,
): Promise<readonly PageComparison[]> {
  await page.addStyleTag({ content: '#lab-chrome { display: none !important; }' });
  await page.mouse.move(0, 0);
  const pages = content(page).locator('.pm-page');
  const count = await pages.count();
  const shown: {
    image: Buffer;
    words: string[];
    width: number;
    height: number;
    x: number;
    y: number;
  }[] = [];
  for (let index = 0; index < count; index += 1) {
    const one = pages.nth(index);
    const box = await one.boundingBox();
    shown.push({
      image: await one.screenshot({ caret: 'hide', animations: 'disabled' }),
      words: words(await one.evaluate(visibleText)),
      width: box?.width ?? 0,
      height: box?.height ?? 0,
      x: box?.x ?? 0,
      y: box?.y ?? 0,
    });
  }

  const printed = await context.newPage();
  await printed.setContent(await snapshot(), { waitUntil: 'load' });
  await printed.evaluate(async () => {
    await document.fonts.ready;
  });
  const pdf = await printed.pdf({ preferCSSPageSize: true });
  const sheets = pdfSheets(pdf);
  expect(sheets, 'one sheet per page').toHaveLength(count);
  sheets.forEach((sheet, index) => {
    const page = shown[index];
    expect(
      Math.abs(sheet.width - (page?.width ?? 0) * 0.75),
      `sheet ${String(index)} width`,
    ).toBeLessThan(1);
    expect(
      Math.abs(sheet.height - (page?.height ?? 0) * 0.75),
      `sheet ${String(index)} height`,
    ).toBeLessThan(1);
  });
  pdfPageTexts(pdf, count).forEach((text, index) => {
    expect(missingWords(shown[index]?.words ?? [], text), `sheet ${String(index)} text`).toEqual(
      [],
    );
  });

  await printed.emulateMedia({ media: 'print' });
  const printedPages = printed.locator('.pm-page');
  await alignToEditor(
    printedPages,
    shown.map(({ x, y }) => ({ x, y })),
  );
  const comparisons: PageComparison[] = [];
  for (let index = 0; index < count; index += 1) {
    const image = await printedPages.nth(index).screenshot({ animations: 'disabled' });
    const editor = shown[index]?.image ?? Buffer.alloc(0);
    const { share: differing, box } = await differingShare(printed, editor, image);
    comparisons.push({ index, differing, box });
    // A page that differs too much keeps both images with the test's results, to see where.
    if (differing > PIXEL_TOLERANCE) {
      const name = `page ${String(index)}`;
      await test.info().attach(`${name} in the editor`, { body: editor, contentType: 'image/png' });
      await test.info().attach(`${name} in print`, { body: image, contentType: 'image/png' });
    }
  }
  await printed.close();
  for (const { index, differing, box } of comparisons) {
    expect(differing, `page ${String(index)} differing pixels, within ${box}`).toBeLessThanOrEqual(
      PIXEL_TOLERANCE,
    );
  }
  return comparisons;
}
