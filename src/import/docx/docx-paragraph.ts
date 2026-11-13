// One paragraph of a word processing document as the pieces of stored content it gives: a heading,
// a paragraph at its level and in its style, a list item, part of a quote, a code block, a figure,
// display math, a rule or a caption, split where a page break falls inside it.

import type { StoredNode } from '../../model/format/document-format.js';
import { childElement, childElements, childValue, type XmlElement } from '../xml-read.js';
import { type DocxReading, readInlineContent } from './docx-inline.js';
import { numberingOf, type NumberingRole } from './docx-numbering.js';
import type { ParagraphRole } from './docx-styles.js';

/** A piece of a paragraph, before lists, quotes and captions are put together. */
export type Piece =
  | { readonly kind: 'block'; readonly node: StoredNode }
  | {
      readonly kind: 'item';
      readonly list: Extract<NumberingRole, { kind: 'list' }>;
      readonly node: StoredNode;
    }
  | { readonly kind: 'quote'; readonly node: StoredNode }
  /** A paragraph that, right after a list item, is another paragraph of that item. */
  | { readonly kind: 'more'; readonly node: StoredNode }
  | { readonly kind: 'caption'; readonly text: string };

/** What paragraph reading needs beyond a part's reading: the custom styles it may keep. */
export interface ParagraphReading extends DocxReading {
  /** Whether a custom style key is kept; every key when no template limits them. */
  readonly keepsStyle: (key: string) => boolean;
}

const plainText = (content: readonly StoredNode[]) =>
  content.map((node) => (node.type === 'lineBreak' ? '\n' : (node.text ?? ''))).join('');

const isBlankText = (node: StoredNode) => node.type === 'text' && !node.text?.trim();

// The inline content split at its page breaks, each break as `null` between the parts.
function splitAtPageBreaks(content: readonly StoredNode[]): (StoredNode[] | null)[] {
  const parts: (StoredNode[] | null)[] = [[]];
  for (const node of content) {
    if (node.type === 'pageBreak') parts.push(null, []);
    else (parts[parts.length - 1] ?? []).push(node);
  }
  return parts;
}

const withContent = (
  type: string,
  attrs: Record<string, unknown>,
  content: StoredNode[],
): StoredNode => ({
  type,
  ...(Object.keys(attrs).length ? { attrs } : {}),
  ...(content.length ? { content } : {}),
});

// A paragraph holding only one image, or only display math, as a block of its own.
function objectBlock(content: readonly StoredNode[], display: boolean): StoredNode | null {
  const shown = content.filter((node) => !isBlankText(node));
  const only = shown.length === 1 ? shown[0] : null;
  if (only?.type === 'image') {
    const { src, alt, width, height } = only.attrs ?? {};
    return {
      type: 'figure',
      attrs: {
        src,
        ...(alt ? { alt } : {}),
        ...(width ? { width, height } : {}),
        captionEnabled: false,
      },
    };
  }
  if (only?.type === 'math' && display)
    return { type: 'mathBlock', ...(only.attrs ? { attrs: only.attrs } : {}) };
  return null;
}

// The heading or paragraph a role gives content, or null for a role that is not a text block.
function textBlock(
  role: ParagraphRole,
  level: { outline: number | null; paragraph: number },
  content: StoredNode[],
): StoredNode | null {
  switch (role.kind) {
    case 'heading':
      return withContent('heading', role.level > 1 ? { level: role.level } : {}, content);
    case 'title':
      return withContent('heading', { title: true }, content);
    case 'custom': {
      const at = level.outline;
      if (at !== null)
        return withContent(
          'heading',
          { ...(at > 1 ? { level: at } : {}), style: role.key },
          content,
        );
      return withContent(
        'paragraph',
        { style: role.key, ...(level.paragraph > 1 ? { level: level.paragraph } : {}) },
        content,
      );
    }
    case 'paragraph':
    case 'other':
      return withContent(
        'paragraph',
        level.paragraph > 1 ? { level: level.paragraph } : {},
        content,
      );
    default:
      return null;
  }
}

// A paragraph's role, after the template's styles and its outline level are taken into account.
function roleOf(p: XmlElement, reading: ParagraphReading): ParagraphRole {
  const pPr = childElement(p, 'w:pPr');
  const role = reading.styles.roleOf(childValue(pPr, 'w:pStyle'));
  if (role.kind === 'other') reading.warnings.add('style-left-out', role.name);
  if (role.kind !== 'custom' || reading.keepsStyle(role.key)) return role;
  reading.warnings.add('style-left-out', role.key);
  return { kind: 'paragraph', level: 1 };
}

interface ParagraphShape {
  readonly role: ParagraphRole;
  readonly numbering: NumberingRole | null;
  readonly outline: number | null;
  readonly display: boolean;
  readonly listParagraph: boolean;
}

// The piece a part of a text paragraph gives: a list item, another paragraph of the item before
// it, or a heading or paragraph by its role.
function textPiece(
  content: StoredNode[],
  { role, numbering, outline, listParagraph }: ParagraphShape,
): Piece {
  const paragraph =
    numbering?.kind === 'paragraph' ? numbering.level : role.kind === 'paragraph' ? role.level : 1;
  const isText = role.kind === 'paragraph' || role.kind === 'other';
  if (numbering?.kind === 'list' && isText) {
    return { kind: 'item', list: numbering, node: withContent('paragraph', {}, content) };
  }
  if (listParagraph && isText && !numbering)
    return { kind: 'more', node: withContent('paragraph', {}, content) };
  return {
    kind: 'block',
    node: textBlock(role, { outline, paragraph }, content) ?? withContent('paragraph', {}, content),
  };
}

// The piece one part of a paragraph, between page breaks, gives.
function pieceOf(content: StoredNode[], shape: ParagraphShape): Piece {
  const object = objectBlock(content, shape.display);
  if (object) return { kind: 'block', node: object };
  const { role } = shape;
  if (role.kind === 'code') {
    const text = plainText(content);
    return {
      kind: 'block',
      node: withContent('codeBlock', {}, text ? [{ type: 'text', text }] : []),
    };
  }
  if (role.kind === 'caption') return { kind: 'caption', text: plainText(content).trim() };
  if (role.kind === 'quote') return { kind: 'quote', node: withContent('paragraph', {}, content) };
  return textPiece(content, shape);
}

// What an empty paragraph gives when it is not an empty paragraph: nothing when its only content is
// its section's properties, which the writer adds for an empty section or one ending in a table,
// and a rule when its only border is the bottom one.
function emptyPieces(pPr: XmlElement | null): Piece[] | null {
  if (childElement(pPr, 'w:pageBreakBefore')) return null;
  if (childElement(pPr, 'w:sectPr')) return [];
  const borders = childElements(childElement(pPr, 'w:pBdr'));
  if (borders.length === 1 && borders[0]?.name === 'w:bottom')
    return [{ kind: 'block', node: { type: 'rule' } }];
  return null;
}

/** The pieces a paragraph (`w:p`) gives (DOCE-IMPORT-2.2). */
export function readParagraph(p: XmlElement, reading: ParagraphReading): Piece[] {
  const pPr = childElement(p, 'w:pPr');
  const styleId = childValue(pPr, 'w:pStyle');
  const role = roleOf(p, reading);
  const outlineValue = childValue(pPr, 'w:outlineLvl');
  const shape: ParagraphShape = {
    role,
    numbering: reading.numbering.roleOf(numberingOf(pPr) ?? reading.styles.numberingOf(styleId)),
    outline: outlineValue === null ? null : Number(outlineValue) + 1,
    display: !!childElement(p, 'm:oMathPara'),
    listParagraph: reading.styles.isListParagraph(styleId),
  };
  const content = readInlineContent(p, reading);
  const empty = content.length ? null : emptyPieces(pPr);
  if (empty) return empty;
  const pieces: Piece[] = childElement(pPr, 'w:pageBreakBefore')
    ? [{ kind: 'block', node: { type: 'pageBreak' } }]
    : [];
  const parts = splitAtPageBreaks(content);
  parts.forEach((part, index) => {
    if (part === null) pieces.push({ kind: 'block', node: { type: 'pageBreak' } });
    // The empty part a page break at a paragraph's start or end leaves is not a paragraph.
    else if (part.length || parts.length === 1 || (index > 0 && index < parts.length - 1))
      pieces.push(pieceOf(part, shape));
  });
  return pieces;
}
