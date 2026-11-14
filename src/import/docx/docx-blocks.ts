// The blocks of a body, cell, header, footer or comment: paragraphs read piece by piece, then put
// together, as the stored format holds them: list items into nested lists, quote paragraphs into
// one quote, a list paragraph into the list item before it, and a caption into the table, figure or
// code block beside it. Content controls give the blocks
// they hold; other block content the stored format has no place for is left out.

import type { StoredNode } from '../../model/format/document-format.js';
import { childElement, childElements, type XmlElement } from '../xml-read.js';
import { type ParagraphReading, type Piece, readParagraph } from './docx-paragraph.js';
import { readTable } from './docx-tables.js';

interface OpenList {
  readonly node: StoredNode & { content: StoredNode[] };
  readonly depth: number;
  readonly ordered: boolean;
  /** The numbering instance (`numId`) its items are numbered by. */
  readonly list: string;
}

interface Assembly {
  readonly out: StoredNode[];
  lists: OpenList[];
  /** A caption waiting for the table or figure after it. */
  caption: string | null;
}

const isCaptioned = (node: StoredNode | undefined) =>
  (node?.type === 'table' || node?.type === 'figure' || node?.type === 'codeBlock') &&
  typeof node.attrs?.caption !== 'string';

function withCaption(node: StoredNode, caption: string): StoredNode {
  const { captionEnabled: _, ...attrs } = node.attrs ?? {};
  return { ...node, attrs: { ...attrs, caption } };
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

function placeBlock(assembly: Assembly, node: StoredNode): void {
  const { out } = assembly;
  const caption = assembly.caption;
  assembly.caption = null;
  if (caption !== null && isCaptioned(node)) out.push(withCaption(node, caption));
  else {
    if (caption !== null)
      out.push({ type: 'paragraph', content: [{ type: 'text', text: caption }] });
    out.push(node);
  }
}

function place(assembly: Assembly, piece: Piece): void {
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
  const { out } = assembly;
  const last = out[out.length - 1];
  if (piece.kind === 'caption') {
    if (isCaptioned(last) && last && assembly.caption === null)
      out[out.length - 1] = withCaption(last, piece.text);
    else assembly.caption = piece.text;
  } else if (piece.kind === 'quote' && last?.type === 'blockquote') {
    out[out.length - 1] = { ...last, content: [...(last.content ?? []), piece.node] };
  } else if (piece.kind === 'quote')
    placeBlock(assembly, { type: 'blockquote', content: [piece.node] });
  else placeBlock(assembly, piece.node);
}

// The pieces one block-level element gives.
function piecesOf(element: XmlElement, reading: ParagraphReading): Piece[] {
  switch (element.name) {
    case 'w:p':
      return readParagraph(element, reading);
    case 'w:tbl':
      return [{ kind: 'block', node: readTable(element, (tc) => readBlocks(tc, reading)) }];
    case 'w:sdt':
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
export function readBlocks(container: XmlElement | null, reading: ParagraphReading): StoredNode[] {
  return readBlockElements(childElements(container), reading);
}

/** The blocks of a run of block-level elements. */
export function readBlockElements(
  elements: readonly XmlElement[],
  reading: ParagraphReading,
): StoredNode[] {
  const assembly: Assembly = { out: [], lists: [], caption: null };
  for (const element of elements) {
    for (const piece of piecesOf(element, reading)) place(assembly, piece);
  }
  if (assembly.caption !== null) {
    assembly.out.push({ type: 'paragraph', content: [{ type: 'text', text: assembly.caption }] });
  }
  return assembly.out;
}
