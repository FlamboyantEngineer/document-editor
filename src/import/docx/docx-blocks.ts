// The blocks of a body, cell, header, footer or comment: paragraphs read piece by piece, then put
// together, as the stored format holds them: list items into nested lists, quote paragraphs into
// one quote, a list paragraph into the list item before it, and captions and tables of contents
// resolved (`docx-captions.ts`). Content controls give the blocks they hold; other block content the
// stored format has no place for is left out.

import type { StoredNode } from '../../model/format/document-format.js';
import { childElement, childElements, childValue, type XmlElement } from '../xml-read.js';
import {
  type BlockReading,
  dropContents,
  type Entry,
  isNode,
  joinCaptions,
} from './docx-captions.js';
import { type Piece, readParagraph } from './docx-paragraph.js';
import { readTable } from './docx-tables.js';

interface OpenList {
  readonly node: StoredNode & { content: StoredNode[] };
  readonly depth: number;
  readonly ordered: boolean;
  /** The numbering instance (`numId`) its items are numbered by. */
  readonly list: string;
}

interface Assembly {
  readonly out: Entry[];
  lists: OpenList[];
}

// A bulleted item whose text starts with a box character and a space, as the writer writes a
// checklist item and as checklists typed in Word look, is a checklist item without the box.
const BOX = /^([\u2610\u2611\u2612])[ \u00a0]/;

function checklistItem(paragraph: StoredNode, ordered: boolean): StoredNode {
  const [first, ...rest] = paragraph.content ?? [];
  const box = !ordered && first?.type === 'text' ? BOX.exec(first.text ?? '') : null;
  if (!first || !box) return { type: 'listItem', content: [paragraph] };
  const text = (first.text ?? '').slice(box[0].length);
  const content = text ? [{ ...first, text }, ...rest] : rest;
  const { content: _, ...bare } = paragraph;
  return {
    type: 'listItem',
    attrs: { checked: box[1] !== '\u2610' },
    content: [content.length ? { ...bare, content } : bare],
  };
}

// A list item placed in the open lists: in the list at its depth when it is of the same kind and
// numbering, a new one nested in the last item above it, or a new list at the top.
function placeItem(assembly: Assembly, piece: Extract<Piece, { kind: 'item' }>): void {
  const { depth, ordered, start, list: numbering } = piece.list;
  const item = checklistItem(piece.node, ordered);
  let lists = assembly.lists.filter((list) => list.depth <= depth);
  const top = lists[lists.length - 1];
  if (top?.depth === depth && top.ordered === ordered && top.list === numbering) {
    top.node.content.push(item);
    assembly.lists = lists;
    return;
  }
  if (top?.depth === depth) lists = lists.slice(0, -1);
  const node = {
    type: ordered ? 'orderedList' : 'bulletList',
    ...(ordered && start !== 1 ? { attrs: { start } } : {}),
    content: [item],
  };
  const parent = lists[lists.length - 1]?.node.content.at(-1);
  if (parent) parent.content = [...(parent.content ?? []), node];
  else assembly.out.push(node);
  assembly.lists = [...lists, { node, depth, ordered, list: numbering }];
}

function place(assembly: Assembly, piece: Piece, reading: BlockReading): void {
  if (piece.kind === 'item') {
    placeItem(assembly, piece);
    return;
  }
  const item = assembly.lists.at(-1)?.node.content.at(-1);
  if (piece.kind === 'more' && item) {
    item.content = [...(item.content ?? []), piece.node];
    return;
  }
  assembly.lists = [];
  if (piece.kind === 'caption' || piece.kind === 'contents') assembly.out.push(piece);
  else if (piece.kind === 'quote') placeQuote(assembly.out, piece.node);
  else {
    assembly.out.push(piece.node);
    const bookmarks = piece.kind === 'block' ? (piece.bookmarks ?? []) : [];
    for (const name of bookmarks) reading.bookmarks.set(name, piece.node);
  }
}

// A quote paragraph, in the quote just before it or a new one.
function placeQuote(out: Entry[], paragraph: StoredNode): void {
  const last = out[out.length - 1] ?? null;
  if (isNode(last) && last.type === 'blockquote') {
    out[out.length - 1] = { ...last, content: [...(last.content ?? []), paragraph] };
  } else out.push({ type: 'blockquote', content: [paragraph] });
}

// A table's header cells without bold, in place, since the template's table style sets their weight.
function dropHeaderBold(node: StoredNode, header = false): void {
  const inHeader = header || node.type === 'tableHeader';
  if (node.type === 'text' && inHeader && node.marks) {
    node.marks = node.marks.filter((mark) => mark.type !== 'bold');
    if (!node.marks.length) delete node.marks;
  }
  for (const child of node.content ?? []) dropHeaderBold(child, inHeader);
}

// Whether a content control is a table of contents Word built.
const isContentsControl = (sdt: XmlElement) =>
  /table of contents/i.test(
    childValue(childElement(childElement(sdt, 'w:sdtPr'), 'w:docPartObj'), 'w:docPartGallery') ??
      '',
  );

// The pieces one block-level element gives.
function piecesOf(element: XmlElement, reading: BlockReading): Piece[] {
  switch (element.name) {
    case 'w:p':
      return readParagraph(element, reading);
    case 'w:tbl': {
      reading.warnings.add('table-style-applied');
      const inTable = { ...reading, inTable: true };
      const table = readTable(element, (tc) => readBlocks(tc, inTable));
      dropHeaderBold(table);
      return [{ kind: 'block', node: table }];
    }
    case 'w:sdt':
      if (isContentsControl(element)) return [{ kind: 'contents' }];
      return childElements(childElement(element, 'w:sdtContent')).flatMap((child) =>
        piecesOf(child, reading),
      );
    case 'w:customXml':
    case 'w:ins':
    case 'w:moveTo':
      return childElements(element).flatMap((child) => piecesOf(child, reading));
    case 'w:altChunk':
      reading.warnings.add('content-left-out', 'embedded document');
      return [];
    default:
      return [];
  }
}

/** The blocks of a container's block-level children (DOCE-IMPORT-2.2). */
export function readBlocks(container: XmlElement | null, reading: BlockReading): StoredNode[] {
  return readBlockElements(childElements(container), reading);
}

/** The blocks of a run of block-level elements. */
export function readBlockElements(
  elements: readonly XmlElement[],
  reading: BlockReading,
): StoredNode[] {
  const assembly: Assembly = { out: [], lists: [] };
  for (const element of elements) {
    for (const piece of piecesOf(element, reading)) place(assembly, piece, reading);
  }
  dropContents(assembly.out, reading);
  joinCaptions(assembly.out, reading);
  return assembly.out.filter(isNode);
}

export type { BlockReading } from './docx-captions.js';
