// One paragraph of a word processing document as the pieces of stored content it gives: a heading,
// a paragraph at its level and in its style, a list item, part of a quote, a code block, a figure,
// display math, a rule or a caption, split where a page break falls inside it; or, for part of a
// table of contents, a marker that it was skipped.

import type { StoredNode } from '../../model/format/document-format.js';
import { storedCaption } from '../../model/schema/caption-content.js';
import {
  childElement,
  childElements,
  childValue,
  findElements,
  type XmlElement,
} from '../xml-read.js';
import { captionOf, type CaptionPiece, isLabel, plainText } from './docx-caption-content.js';

export type { CaptionPiece };
import { type DocxReading, readInlineContent } from './docx-inline.js';
import { numberingOf, type NumberingRole } from './docx-numbering.js';
import type { ParagraphRole } from './docx-styles.js';

/** A piece of a paragraph, before lists, quotes and captions are put together. */
export type Piece =
  | { readonly kind: 'block'; readonly node: StoredNode; readonly bookmarks?: readonly string[] }
  | {
      readonly kind: 'item';
      readonly list: Extract<NumberingRole, { kind: 'list' }>;
      readonly node: StoredNode;
    }
  | { readonly kind: 'quote'; readonly node: StoredNode }
  /** A paragraph that, right after a list item, is another paragraph of that item. */
  | { readonly kind: 'more'; readonly node: StoredNode }
  | CaptionPiece
  /** Part of a table of contents, left out. */
  | { readonly kind: 'contents' };

/** What paragraph reading needs beyond a part's reading: the custom styles it may keep. */
export interface ParagraphReading extends DocxReading {
  /** Whether a custom style key is kept; every key when no template limits them. */
  readonly keepsStyle: (key: string) => boolean;
  /** Whether a plain paragraph whose text starts with a caption label may be a caption. */
  readonly textCaptions: boolean;
  /** Whether the paragraphs being read are in a table's cell. */
  readonly inTable?: boolean;
  /** The headings in a style whose name or a parent's names an appendix or annex. */
  readonly appendixHeadings?: Set<StoredNode>;
}

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
      content: [storedCaption('')],
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

// A title paragraph is the document's title only in the body, outside lists, and with text; else
// it is a plain paragraph.
function titleRole(
  role: ParagraphRole,
  { numbered, content }: { numbered: boolean; content: readonly StoredNode[] },
  reading: ParagraphReading,
): ParagraphRole {
  if (role.kind !== 'title') return role;
  if (reading.inTable || numbered || !plainText(content).trim())
    return { kind: 'paragraph', level: 1 };
  reading.warnings.add('title-applied');
  return role;
}

// The names of the bookmarks a paragraph holds, which cross-references name.
const bookmarksOf = (p: XmlElement) =>
  findElements(p, 'w:bookmarkStart')
    .map((bookmark) => bookmark.attrs['w:name'] ?? '')
    .filter(Boolean);

interface ParagraphShape {
  readonly role: ParagraphRole;
  readonly bookmarks: readonly string[];
  readonly textCaptions: boolean;
  readonly numbering: NumberingRole | null;
  readonly outline: number | null;
  readonly display: boolean;
  readonly listParagraph: boolean;
}

// The piece a part of a text paragraph gives: a list item, another paragraph of the item before
// it, or a heading or paragraph by its role.
function textPiece(
  content: StoredNode[],
  { role, numbering, outline, listParagraph, bookmarks }: ParagraphShape,
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
    bookmarks,
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
  if (role.kind === 'caption' || content.some(isLabel)) {
    return captionOf(content, true, shape.bookmarks) ?? textPiece(content, shape);
  }
  if (role.kind === 'quote') return { kind: 'quote', node: withContent('paragraph', {}, content) };
  const plain = (role.kind === 'paragraph' && role.level === 1) || role.kind === 'other';
  const caption =
    shape.textCaptions && plain && !shape.numbering && !shape.listParagraph
      ? captionOf(content, false, shape.bookmarks)
      : null;
  return caption ?? textPiece(content, shape);
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

// The heading level an outline level gives: levels 0 to 5 are headings 1 to 6, and 6 to 8 are
// headings at the sixth level; 9 is body text, and an unreadable level is no heading.
function headingLevelOf(outline: string | null): number | null {
  const level = Number(outline ?? Number.NaN);
  return Number.isInteger(level) && level >= 0 && level < 9 ? Math.min(level + 1, 6) : null;
}

// Whether a paragraph's heading is deeper than the stored format's six levels.
const isClamped = (role: ParagraphRole, outline: string | null) =>
  (role.kind === 'heading' && role.clamped === true) ||
  (role.kind === 'custom' && ['6', '7', '8'].includes(outline ?? ''));

// The content of a paragraph, or null when it is part of a table of contents: in a contents
// field's result or a contents style.
function contentOf(
  p: XmlElement,
  role: ParagraphRole,
  reading: ParagraphReading,
): StoredNode[] | null {
  const { open } = reading;
  open.contents = role.kind === 'contents';
  const content = readInlineContent(p, reading);
  const inContents = open.contents === true;
  open.contents = false;
  return inContents ? null : content;
}

/** The pieces a paragraph (`w:p`) gives (DOCE-IMPORT-2.2). */
export function readParagraph(p: XmlElement, reading: ParagraphReading): Piece[] {
  const pPr = childElement(p, 'w:pPr');
  const styleId = childValue(pPr, 'w:pStyle');
  const styled = roleOf(p, reading);
  const read = contentOf(p, styled, reading);
  if (read === null) return [{ kind: 'contents' }];
  const content = read;
  const outlineValue = childValue(pPr, 'w:outlineLvl');
  const numbering = reading.numbering.roleOf(
    numberingOf(pPr) ?? reading.styles.numberingOf(styleId),
  );
  const role = titleRole(styled, { numbered: numbering?.kind === 'list', content }, reading);
  if (isClamped(role, outlineValue)) reading.warnings.add('heading-level-clamped');
  // A numbered heading takes the template's heading numbering instead of its own.
  if (role.kind === 'heading' && numbering) reading.warnings.add('heading-numbering-applied');
  const shape: ParagraphShape = {
    role,
    bookmarks: bookmarksOf(p),
    textCaptions: reading.textCaptions,
    numbering,
    outline: headingLevelOf(outlineValue),
    display: !!childElement(p, 'm:oMathPara'),
    listParagraph: reading.styles.isListParagraph(styleId),
  };
  const empty = content.length ? null : emptyPieces(pPr);
  if (empty) return empty;
  const appendix = reading.styles.namesOf(styleId).some((name) => /appendix|annex/.test(name));
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
  if (appendix) markAppendix(pieces, reading);
  return pieces;
}

// Records the headings of an appendix style, where the reader may start a document's appendices.
function markAppendix(pieces: readonly Piece[], reading: ParagraphReading): void {
  for (const piece of pieces) {
    if (piece.kind === 'block' && piece.node.type === 'heading')
      reading.appendixHeadings?.add(piece.node);
  }
}
