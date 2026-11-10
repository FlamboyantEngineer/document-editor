// What a status bar reports about a document: how many pages it is laid out on, which one holds the
// caret, and how many words its body, its footnotes and the selection hold. Page headers and footers are left
// out, and so are the header rows a split table repeats on later pages. Each block's count is kept
// for as long as the block is, so a long document is counted again only where it changed.

import type { Node } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import { countTextWords } from '../model/index.js';

/** A document's pages and words, as a status bar reports them. */
export interface DocumentStatistics {
  /** The pages the document is laid out on; 1 for a document in the web layout. */
  readonly pages: number;
  /** The page holding the selection's head, counted from 1. */
  readonly page: number;
  /** The words of the document's body and footnotes. */
  readonly words: number;
  /** The words the selection holds, or null for a caret or a selection holding none. */
  readonly selectedWords: number | null;
}

// A textblock's text, with each inline node that is not text, and the text inside one such as a
// footnote, set apart by spaces.
function inlineText(node: Node): string {
  let text = '';
  node.forEach((child) => {
    if (child.isText) text += child.text ?? '';
    else text += child.childCount > 0 ? ` ${inlineText(child)} ` : ' ';
  });
  return text;
}

const blockWords = new WeakMap<Node, number>();

const isHeaderRow = (row: Node) => {
  let header = row.childCount > 0;
  row.forEach((cell) => {
    if (cell.type.name !== 'table_header') header = false;
  });
  return header;
};

// The words of a block, counted once for each block node.
function wordsOf(block: Node): number {
  const known = blockWords.get(block);
  if (known !== undefined) return known;
  let words = 0;
  if (block.isTextblock) words = countTextWords(inlineText(block));
  else {
    // A later part of a split table repeats the header rows its first part leads with.
    const repeats = block.type.name === 'table' && Number(block.attrs.splitPartIndex ?? 0) > 0;
    let leading = repeats;
    block.forEach((child) => {
      leading = leading && isHeaderRow(child);
      if (!leading) words += wordsOf(child);
    });
  }
  blockWords.set(block, words);
  return words;
}

// The regions of a page that hold the document's own text: its body and its footnotes.
const BODY_REGIONS = new Set(['page_content', 'page_footnotes']);

// Each page's body and footnote area, with the position just inside it, in document order.
function pageBodies(doc: Node, visit: (body: Node, pos: number, page: number) => void) {
  let page = 0;
  doc.forEach((section, sectionOffset) => {
    if (section.type.name !== 'page_section') return;
    section.forEach((pageNode, pageOffset) => {
      if (pageNode.type.name !== 'page') return;
      page += 1;
      const pagePos = sectionOffset + 1 + pageOffset;
      pageNode.forEach((region, regionOffset) => {
        if (BODY_REGIONS.has(region.type.name)) {
          visit(region, pagePos + 1 + regionOffset + 1, page);
        }
      });
    });
  });
  return page;
}

/** The document's pages and words, and where the selection is among them. */
export function documentStatistics(state: EditorState): DocumentStatistics {
  const { doc, selection } = state;
  let words = 0;
  let page = 1;
  const pages = pageBodies(doc, (body, start, index) => {
    if (selection.head >= start && selection.head <= start + body.content.size) page = index;
    body.forEach((block) => {
      words += wordsOf(block);
    });
  });
  const selected = selection.empty
    ? 0
    : countTextWords(doc.textBetween(selection.from, selection.to, ' ', ' '));
  return { pages: Math.max(pages, 1), page, words, selectedWords: selected > 0 ? selected : null };
}
