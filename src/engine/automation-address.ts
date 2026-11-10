// Addressing a live document by element id: finding an element, made whole when the pages split
// it into parts, and turning offsets in its text into document positions. An element's text counts
// each character of its text and each inline object, such as a footnote marker, as one.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import { joinSectionPages } from '../model/index.js';

/** Where an edit acts: an element, and a range of its text when it holds text. */
export interface EditAddress {
  readonly elementId: string;
  /** The offset in the element's text where the range starts; defaults to its start. */
  readonly from?: number | undefined;
  /** The offset where it ends; defaults to the end of the text. */
  readonly to?: number | undefined;
  /**
   * The text the caller read in the range; the edit is refused as stale when the document no
   * longer holds it there.
   */
  readonly expect?: string | undefined;
}

/** An element found in a document. */
export interface FoundElement {
  readonly node: ProseMirrorNode;
  readonly pos: number;
}

function partsOf(doc: ProseMirrorNode, id: string): FoundElement[] {
  const found: FoundElement[] = [];
  doc.descendants((node, pos) => {
    if (node.attrs.dataId === id) {
      found.push({ node, pos });
      return false;
    }
    return true;
  });
  return found;
}

// The section and page index a position is on.
function pageOf(doc: ProseMirrorNode, pos: number) {
  const $pos = doc.resolve(pos);
  if ($pos.depth < 2 || $pos.node(1).type.name !== 'page_section') return null;
  return { section: $pos.before(1), page: $pos.index(1) };
}

/**
 * The element with an id in the transaction's document, joining the pages its parts sit on first
 * when the pages split it; null when the document has no such element.
 */
export function wholeElement(tr: Transaction, id: string): FoundElement | null {
  const parts = partsOf(tr.doc, id);
  const first = parts[0];
  const last = parts.at(-1);
  if (!first || !last) return null;
  if (parts.length > 1) {
    const start = pageOf(tr.doc, first.pos);
    const end = pageOf(tr.doc, last.pos);
    if (start && end && start.section === end.section) {
      joinSectionPages(tr, start.section, { from: start.page, to: end.page });
    }
  }
  return partsOf(tr.doc, id)[0] ?? null;
}

/** The text of a text block, each inline object as a space, and each character's position. */
export function textOf(block: FoundElement): { text: string; positions: number[] } {
  let text = '';
  const positions: number[] = [];
  block.node.forEach((child, offset) => {
    const pos = block.pos + 1 + offset;
    if (child.isText && child.text) {
      text += child.text;
      for (let index = 0; index < child.text.length; index += 1) positions.push(pos + index);
    } else {
      text += ' ';
      positions.push(pos);
    }
  });
  return { text, positions };
}

/** The document range of a range of a text block's text, or null when it is out of bounds. */
export function textRange(
  block: FoundElement,
  { from, to }: Pick<EditAddress, 'from' | 'to'>,
): { from: number; to: number; text: string } | null {
  const { text, positions } = textOf(block);
  const end = block.pos + block.node.nodeSize - 1;
  const start = from ?? 0;
  const stop = to ?? text.length;
  if (start < 0 || stop > text.length || start > stop) return null;
  const at = (offset: number) => (offset < positions.length ? (positions[offset] ?? end) : end);
  return { from: at(start), to: at(stop), text: text.slice(start, stop) };
}
