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
}

/** What one block fragment draws: the text of each of its lines, or null when it is not drawn. */
export type DrawnLines = readonly string[] | null;

/** What the pages draw: how many pages, and the forced blocks each page shows. */
export interface DrawnPages {
  readonly pages: number;
  /** Each page's forced blocks, as `elementId#part`. */
  readonly forced: readonly (readonly string[])[];
}

/** Where the pages are read: the editor's (by default) or the read-only viewer's. */
export type PagesIn = 'editor' | 'viewer';

// The pages of the editor's view, or of the viewer, whose content element is its root's child.
const PAGES: Record<PagesIn, string> = {
  editor: ':not(.de-document-viewer) > .de-document-editor__content .pm-page',
  viewer: '.de-document-viewer > .de-document-editor__content .pm-page',
};

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
    [forcedSelector, PAGES[pagesIn]] as const,
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
      const ownText = (node: Node, block: Element) => {
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
    [blocks, PAGES[pagesIn]] as const,
  );
}
