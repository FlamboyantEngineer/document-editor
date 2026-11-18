// A caption's content once its label is read: the separator and the text the label took off, and
// the spaces at its ends, left out, its formats, footnotes and comments kept.

import type { StoredNode } from '../../model/format/document-format.js';
import { CAPTION_LABEL_MARK } from './docx-fields.js';

/** What a caption numbers, as its label says; null when it says nothing the reader knows. */
type CaptionLabel = 'figure' | 'table' | 'code' | null;

/** A caption read from a paragraph, before it is joined to what it captions. */
export interface CaptionPiece {
  readonly kind: 'caption';
  /** Its text without its label, number and separator. */
  readonly text: string;
  /** Its inline content without its label, number and separator: its formats, footnotes and comments. */
  readonly content: readonly StoredNode[];
  readonly label: CaptionLabel;
  /** Whether Word's caption style or a caption field made it a caption, rather than its text alone. */
  readonly native: boolean;
  /** The paragraph it stays when it captions nothing. */
  readonly paragraph: StoredNode;
  /** The bookmarks in it, which cross-references to it name. */
  readonly bookmarks: readonly string[];
}

/** Inline content as plain text, a line break as a new line. */
export const plainText = (content: readonly StoredNode[]) =>
  content.map((node) => (node.type === 'lineBreak' ? '\n' : (node.text ?? ''))).join('');

// A caption's label and number at the start of its text and the separator after them, as in
// `Figure 2. `, `Table A-1: ` or `Table 3 – `; a number followed by more text, as in `Table 2
// shows`, is no label.
const LABELLED =
  /^\s*(figure|fig\.|table)\s+[A-Z]?[-.]?\d+(?:[-.]\d+)*\s*[.:\-\u2013\u2014](?=\s|$)\s*/i;

// What a label names, from its first word.
function labelOf(text: string): CaptionLabel {
  if (/^\s*fig/i.test(text)) return 'figure';
  if (/^\s*tab/i.test(text)) return 'table';
  return /^\s*(code|listing)/i.test(text) ? 'code' : null;
}

export const isLabel = (node: StoredNode) =>
  node.marks?.some((mark) => mark.type === CAPTION_LABEL_MARK) === true;

// Inline content without the reader's caption label marks.
function unlabelled(content: readonly StoredNode[]): StoredNode[] {
  return content.map((node) => {
    if (!isLabel(node)) return node;
    const marks = node.marks?.filter((mark) => mark.type !== CAPTION_LABEL_MARK) ?? [];
    const { marks: _, ...bare } = node;
    return marks.length ? { ...bare, marks } : bare;
  });
}

// A caption from a paragraph's content: its label and number taken off, from a caption field's
// result or the writer's label runs to the separator after them, else as its text starts; null
// for content that is no caption, which only a text caption may be.
export function captionOf(
  content: readonly StoredNode[],
  native: boolean,
  bookmarks: readonly string[],
): CaptionPiece | null {
  const bare = unlabelled(content);
  const paragraph: StoredNode = { type: 'paragraph', ...(bare.length ? { content: bare } : {}) };
  const last = content.findLastIndex(isLabel);
  if (last >= 0) {
    const field = content.find(isLabel)?.marks?.find((mark) => mark.type === CAPTION_LABEL_MARK);
    const named = typeof field?.attrs?.label === 'string' ? field.attrs.label : '';
    const rest = trimmedContent(content.slice(last + 1), SEPARATOR);
    const label = labelOf(named || plainText(content.slice(0, last + 1)));
    return {
      kind: 'caption',
      text: plainText(rest),
      content: rest,
      label,
      native: true,
      paragraph,
      bookmarks,
    };
  }
  const whole = plainText(content);
  const labelled = LABELLED.exec(whole);
  if (!labelled && !native) return null;
  const rest = trimmedContent(dropLeading(content, labelled?.[0].length ?? 0), /^\s+/);
  const label = labelled ? labelOf(labelled[1] ?? '') : null;
  return {
    kind: 'caption',
    text: plainText(rest),
    content: rest,
    label,
    native,
    paragraph,
    bookmarks,
  };
}

// The separator after a caption's label and number, with the spaces around it.
const SEPARATOR = /^\s*[.:\-\u2013\u2014]?\s*/;

// Inline content without its first `count` characters of text.
function dropLeading(content: readonly StoredNode[], count: number): StoredNode[] {
  let left = count;
  const kept: StoredNode[] = [];
  for (const node of content) {
    if (left > 0 && node.type === 'text') {
      const value = node.text ?? '';
      if (value.length <= left) {
        left -= value.length;
        continue;
      }
      kept.push({ ...node, text: value.slice(left) });
      left = 0;
    } else kept.push(node);
  }
  return kept;
}

// Inline content with `lead` taken off its first text and the spaces at its end off its last, its
// text left out when nothing stays.
function trimmedContent(content: readonly StoredNode[], lead: RegExp): StoredNode[] {
  const kept = [...content];
  const first = kept[0];
  if (first?.type === 'text') kept[0] = { ...first, text: (first.text ?? '').replace(lead, '') };
  const end = kept.length - 1;
  const last = kept[end];
  if (last?.type === 'text') kept[end] = { ...last, text: (last.text ?? '').trimEnd() };
  return kept.filter((node) => node.type !== 'text' || node.text);
}
