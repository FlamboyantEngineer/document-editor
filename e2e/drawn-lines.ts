// Reading the lines the editor draws (DOCE-LABS-8): each text block's characters grouped by the line
// box the browser drew them on, page by page. The reader knows nothing of how lines are forced: it
// takes a block's own text, leaves out what the writer cannot edit (atoms and widgets drawn beside
// the text), and starts a line wherever a character sits below every character of the line before.

import type { Page } from '@playwright/test';

/** A text block fragment to read, by its element id and split part, on a page counted from 0. */
export interface BlockAt {
  readonly page: number;
  readonly elementId: string;
  readonly part: number;
  /** A header's, footer's or footnote area's block, which has no element id: its region and its index in it. */
  readonly region?:
    { readonly name: 'header' | 'footer' | 'footnotes'; readonly index: number } | undefined;
}

/** What one block fragment draws: the text of each of its lines, or null when it is not drawn. */
export type DrawnLines = readonly string[] | null;

/** What the pages draw: how many pages, and the forced blocks each page shows. */
export interface DrawnPages {
  readonly pages: number;
  /** Each page's forced blocks, as `elementId#part`. */
  readonly forced: readonly (readonly string[])[];
}

/**
 * Where the pages are read: the editor's (by default), the read-only viewer's, a print's, or those
 * inside the elements a selector names, such as one editor of several on the page.
 */
export type PagesIn = 'editor' | 'viewer' | 'print' | { readonly within: string };

// The pages of the editor's view, or of the viewer, whose content element is its root's child, or
// of a print document, which holds nothing else.
const PAGES = {
  editor: ':not(.de-document-viewer) > .de-document-editor__content .pm-page',
  viewer: '.de-document-viewer > .de-document-editor__content .pm-page',
  print: '.pm-page',
} as const;

const pagesSelector = (pagesIn: PagesIn) =>
  typeof pagesIn === 'string' ? PAGES[pagesIn] : `${pagesIn.within} ${PAGES.editor}`;

/** Draws on the page: the pages and the forced blocks they show, by `forcedSelector`. */
export function readDrawnPages(
  page: Page,
  forcedSelector: string,
  pagesIn: PagesIn = 'editor',
): Promise<DrawnPages> {
  return page.evaluate(
    ([selector, pagesSelector]) => {
      const pages = [...document.querySelectorAll(pagesSelector)];
      return {
        pages: pages.length,
        forced: pages.map((each) =>
          [...each.querySelectorAll(selector)].map(
            (block) =>
              `${block.getAttribute('data-id') ?? ''}#${block.getAttribute('data-split-part-index') ?? '0'}`,
          ),
        ),
      };
    },
    [forcedSelector, pagesSelector(pagesIn)] as const,
  );
}

/** The drawn lines of each block, in the order asked. It runs in the page. */
export function readDrawnLines(
  page: Page,
  blocks: readonly BlockAt[],
  pagesIn: PagesIn = 'editor',
): Promise<DrawnLines[]> {
  return page.evaluate(
    ([asked, pagesSelector]) => {
      const pages = [...document.querySelectorAll(pagesSelector)];
      const range = document.createRange();
      // Text the writer cannot edit is drawn beside the block's own: an atom's node view, a widget
      // inside the block. A block that is locked as a whole, such as a template's, is still read.
      // A footnote marker's number and a template variable's value are laid out on the line, as
      // the computed lines read them.
      const ownText = (node: Node, block: Element) => {
        if (node.parentElement?.closest('.footnote-reference, [data-footnote-reference]'))
          return true;
        // So is a template variable's value, which the page variables draw inside it.
        if (node.parentElement?.closest('[data-template-variable]')) return true;
        // A footnote entry's number is drawn before its content, which a print copy no longer marks
        // as not editable.
        if (node.parentElement?.closest('.pm-footnote-entry-number')) return false;
        const beside = node.parentElement?.closest(
          '[contenteditable="false"], .ProseMirror-widget',
        );
        return !beside || !block.contains(beside) || beside === block;
      };
      // Where a node is drawn: a character of a text node, or a hard break, whose box an empty line
      // between two breaks has though it holds no character.
      const boxOf = (node: Node, index: number) => {
        if (node.nodeType === Node.TEXT_NODE) {
          range.setStart(node, index);
          range.setEnd(node, index + 1);
        } else range.selectNode(node);
        return [...range.getClientRects()].find((each) => each.height > 0);
      };
      const find = (at: (typeof asked)[number]) => {
        if (at.region) {
          const area = pages[at.page]?.querySelector(`.pm-page-${at.region.name}`);
          const blocks = area?.querySelectorAll(':is(p, h1, h2, h3, h4, h5, h6, pre)');
          return blocks?.[at.region.index];
        }
        const candidates = pages[at.page]?.querySelectorAll(
          `[data-id="${CSS.escape(at.elementId)}"]`,
        );
        return [...(candidates ?? [])].find(
          (element) => Number(element.getAttribute('data-split-part-index') ?? 0) === at.part,
        );
      };
      return asked.map((at) => {
        const block = find(at);
        if (!block) return null;
        const lines: string[] = [];
        let line = '';
        // The lowest bottom of the line being read, and whether it holds a drawn character yet.
        let bottom = -Infinity;
        let started = false;
        // A character, or a hard break, drawn wholly below the line so far starts the next one. One
        // drawn nowhere, such as a collapsed space, stays on the line it follows.
        const place = (rect: DOMRect | undefined) => {
          if (rect && started && (rect.top + rect.bottom) / 2 > bottom) {
            lines.push(line);
            line = '';
            bottom = -Infinity;
          }
          if (rect) {
            bottom = Math.max(bottom, rect.bottom);
            started = true;
          }
        };
        const walker = document.createTreeWalker(
          block,
          NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
          (node) =>
            node.nodeType === Node.TEXT_NODE || node.nodeName === 'BR'
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_SKIP,
        );
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!ownText(node, block)) continue;
          if (node.nodeName === 'BR') {
            place(boxOf(node, 0));
            continue;
          }
          const text = node.nodeValue ?? '';
          for (let index = 0; index < text.length; index += 1) {
            place(boxOf(node, index));
            line += text[index] === ' ' ? ' ' : text[index];
          }
        }
        lines.push(line);
        return lines;
      });
    },
    [blocks, pagesSelector(pagesIn)] as const,
  );
}

/** A text block fragment with the lines computed for it, to compare with the lines drawn. */
export interface ComputedBlock extends BlockAt {
  readonly lines: readonly string[];
}

/** A block whose drawn lines differ from the computed ones, or that is not drawn. */
export interface LineMismatch {
  readonly page: number;
  /** The block, as `elementId#part`. */
  readonly block: string;
  readonly computed: readonly string[];
  readonly drawn: readonly string[] | null;
}

// Spaces as the stored text holds them: a no-break space a browser kept at a writer's edge is a space.
const plain = (text: string) => text.replaceAll('\u00a0', ' ');

/**
 * The blocks of the engine's result (`textLines()`) that the engine laid out, with their lines'
 * text, to read on the pages: a header's, footer's or footnote entry's by its region and its index in it.
 */
export function blocksToRead(
  computed: readonly { readonly blocks: readonly TextBlockLines[] }[],
): ComputedBlock[] {
  return computed.flatMap(({ blocks }, index) => {
    const inRegion = { header: 0, footer: 0, footnotes: 0 };
    return blocks.flatMap((block) => {
      const region = block.region
        ? { name: block.region, index: (inRegion[block.region] += 1) - 1 }
        : undefined;
      if (!block.lines) return [];
      const lines = block.lines.map((line) => plain(line.text));
      return [{ page: index, elementId: block.elementId, part: block.part, region, lines }];
    });
  });
}

/**
 * The computed blocks of the engine's result (`textLines()`), with their lines' text, and those
 * the pages draw otherwise: each block whose drawn lines differ in count or text.
 */
export async function mismatchedLines(
  page: Page,
  computed: readonly { readonly blocks: readonly TextBlockLines[] }[],
  pagesIn: PagesIn = 'editor',
): Promise<LineMismatch[]> {
  const asked = blocksToRead(computed);
  const drawn = await readDrawnLines(page, asked, pagesIn);
  return asked.flatMap((block, index) => {
    const own = drawn[index]?.map(plain) ?? null;
    const same =
      own !== null &&
      own.length === block.lines.length &&
      own.every((text, at) => text === block.lines[at]);
    return same
      ? []
      : [
          {
            page: block.page,
            block: `${block.elementId}#${String(block.part)}`,
            computed: block.lines,
            drawn: own,
          },
        ];
  });
}

/** What `mismatchedLines` reads of a computed block. */
interface TextBlockLines {
  readonly elementId: string;
  readonly part: number;
  readonly region?: 'header' | 'footer' | 'footnotes' | undefined;
  readonly lines: readonly { readonly text: string }[] | null;
}

/**
 * The code blocks the editor's pages draw on forced lines whose gutter of line numbers is not drawn
 * on their lines: each number whose row is not the first row of its line of code, and each gutter
 * that does not end where its code does, as `id: what`.
 */
export function misplacedLineNumbers(page: Page): Promise<string[]> {
  return page.evaluate((pages) => {
    const misplaced: string[] = [];
    const range = document.createRange();
    // The top of the first character of each line of code, or null for an empty line.
    const lineTops = (code: Element) => {
      const tops: (number | null)[] = [null];
      const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.nodeValue ?? '';
        for (let index = 0; index < text.length; index += 1) {
          if (text[index] === '\n') {
            tops.push(null);
            continue;
          }
          if (tops.at(-1) !== null) continue;
          range.setStart(node, index);
          range.setEnd(node, index + 1);
          const rect = [...range.getClientRects()].find((each) => each.height > 0);
          tops[tops.length - 1] = rect ? rect.top : null;
        }
      }
      return tops;
    };
    for (const pre of document.querySelectorAll(
      `${pages} pre.de-forced-lines:has(> .de-code-gutter)`,
    )) {
      const code = pre.querySelector(':scope > code');
      if (!code) continue;
      const id = pre.getAttribute('data-id') ?? '';
      const tops = lineTops(code);
      const numbers = [...pre.querySelectorAll('.de-code-gutter__number')];
      // A number's glyphs sit at the same height from its row's top on every row, whatever the
      // fonts make that height, so each number keeps the first one's distance to its line.
      let offset: number | null = null;
      numbers.forEach((number, index) => {
        const top = tops[index];
        if (typeof top !== 'number') return;
        const distance = number.getBoundingClientRect().top - top;
        offset ??= distance;
        if (Math.abs(distance - offset) > 1)
          misplaced.push(
            `${id}: number ${String(index + 1)} is ${distance.toFixed(1)} from its line, the first ${offset.toFixed(1)}`,
          );
      });
      const last = pre.querySelector('.de-code-gutter__line:last-child');
      const end =
        code.getBoundingClientRect().bottom - parseFloat(getComputedStyle(code).paddingBottom);
      const gutterEnd = last?.getBoundingClientRect().bottom ?? end;
      if (Math.abs(gutterEnd - end) > 1)
        misplaced.push(
          `${id}: gutter ends at ${gutterEnd.toFixed(1)}, its code at ${end.toFixed(1)}`,
        );
    }
    return misplaced;
  }, PAGES.editor);
}
