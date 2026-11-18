// Captions and tables of contents in a run of blocks, once its paragraphs are read: each caption
// joined to the figure, table or code block beside it, looking first where Word places it, and
// each table of contents left out with the heading before it and the instructions beside it.

import type { StoredNode } from '../../model/format/document-format.js';
import {
  storedBodyOf,
  storedCaption,
  storedCaptionText,
} from '../../model/schema/caption-content.js';
import type { CaptionPiece, ParagraphReading } from './docx-paragraph.js';

/** What block reading needs: a paragraph's reading and where bookmarks are recorded. */
export interface BlockReading extends ParagraphReading {
  /** Each bookmark's block, so cross-references to it can name it once the document is read. */
  readonly bookmarks: Map<string, StoredNode>;
}

/** Part of a table of contents, left out once its heading and instructions are found. */
interface ContentsMarker {
  readonly kind: 'contents';
}

/** A block, or a caption or table of contents still to be resolved; null once resolved away. */
export type Entry = StoredNode | CaptionPiece | ContentsMarker | null;

/** Whether an entry is a block. */
export const isNode = (entry: Entry): entry is StoredNode => !!entry && !('kind' in entry);

const isContents = (entry: Entry | undefined): boolean =>
  !!entry && 'kind' in entry && entry.kind === 'contents';

const plainText = (node: StoredNode): string =>
  node.type === 'text' ? (node.text ?? '') : (node.content ?? []).map(plainText).join('');

const isBlank = (entry: Entry) =>
  isNode(entry) &&
  entry.type === 'paragraph' &&
  !plainText(entry).trim() &&
  !entry.content?.some((child) => child.type !== 'text');

// The heading of a table of contents, and the instructions Word or an author puts beside one.
const CONTENTS_HEADING = /^\s*(table of )?contents\s*$/i;
const CONTENTS_INSTRUCTION =
  /\b(update|replace|refresh|right[- ]click|press f9)\b.*\b(table of contents|contents|toc|this table|field)\b/i;

// The tables of contents left out, each with the heading before it and the instructions beside it.
export function dropContents(entries: Entry[], reading: BlockReading): void {
  for (let at = 0; at < entries.length; at += 1) {
    if (!isContents(entries[at])) continue;
    let end = at;
    while (isContents(entries[end + 1])) end += 1;
    reading.warnings.add('contents-skipped');
    for (let each = at; each <= end; each += 1) entries[each] = null;
    const text = (entry: Entry) => (isNode(entry) ? plainText(entry) : '');
    let before = at - 1;
    while (before >= 0 && CONTENTS_INSTRUCTION.test(text(entries[before] ?? null)))
      entries[before--] = null;
    const heading = entries[before] ?? null;
    if (
      isNode(heading) &&
      ['heading', 'paragraph'].includes(heading.type) &&
      CONTENTS_HEADING.test(plainText(heading))
    )
      entries[before] = null;
    let after = end + 1;
    while (after < entries.length && CONTENTS_INSTRUCTION.test(text(entries[after] ?? null)))
      entries[after++] = null;
    at = after - 1;
  }
}

/** Where a caption looks for what it captions, nearest first, and what it takes on each side. */
const SIDES: Readonly<Record<string, readonly (readonly [-1 | 1, readonly string[]])[]>> = {
  // Word puts a table's caption above it and a figure's below it.
  table: [
    [1, ['table']],
    [-1, ['table']],
  ],
  figure: [
    [-1, ['figure']],
    [1, ['figure']],
  ],
  code: [
    [-1, ['codeBlock']],
    [1, ['codeBlock']],
  ],
  // A caption whose label says nothing: the nearest figure or code above, or table or code below,
  // else whatever the other side has.
  none: [
    [-1, ['figure', 'codeBlock']],
    [1, ['table', 'codeBlock']],
    [-1, ['table']],
    [1, ['figure']],
  ],
};

const CAPTIONED = new Set(['table', 'figure', 'codeBlock']);

// The block a caption at `at` captions on one side, past up to two blank paragraphs, or -1.
function captionedOn(
  entries: readonly Entry[],
  at: number,
  [step, types]: readonly [-1 | 1, readonly string[]],
): number {
  let blanks = 0;
  for (let each = at + step; each >= 0 && each < entries.length; each += step) {
    const entry = entries[each] ?? null;
    if (entry === null) continue;
    if (isBlank(entry) && blanks < 2) {
      blanks += 1;
      continue;
    }
    const free = isNode(entry) && types.includes(entry.type) && !hasCaption(entry);
    return free ? each : -1;
  }
  return -1;
}

// Whether a block has its caption already: a code block's attribute, or a figure's or a table's
// first child.
const hasCaption = (node: StoredNode) =>
  node.type === 'codeBlock'
    ? typeof node.attrs?.caption === 'string'
    : storedCaptionText(node) !== '';

// Gives a block its caption, shown: a code block's attribute, or a figure's or a table's first
// child.
function setCaption(node: StoredNode, text: string): void {
  const { captionEnabled: _, ...attrs } = node.attrs ?? {};
  if (node.type === 'codeBlock') {
    node.attrs = { ...attrs, caption: text };
    return;
  }
  node.attrs = attrs;
  node.content = [storedCaption(text), ...storedBodyOf(node)];
}

// Each caption joined to the figure, table or code block beside it, its paragraph gone; one with
// nothing beside it stays a paragraph, reported when Word's own caption style or field made it.
export function joinCaptions(entries: Entry[], reading: BlockReading): void {
  entries.forEach((entry, at) => {
    if (entry && !isNode(entry) && entry.kind === 'caption') joinCaption(entries, at, reading);
  });
}

// The block a caption captions, nearest first on the sides its label says; null for none.
function captionedBlock(
  entries: readonly Entry[],
  at: number,
  caption: CaptionPiece,
): StoredNode | null {
  for (const side of SIDES[caption.label ?? 'none'] ?? []) {
    const target = captionedOn(entries, at, side);
    const node = target >= 0 ? (entries[target] ?? null) : null;
    if (isNode(node) && CAPTIONED.has(node.type)) return node;
  }
  return null;
}

// The caption at `at` joined to its block, or left as a paragraph.
function joinCaption(entries: Entry[], at: number, reading: BlockReading): void {
  const entry = entries[at] as CaptionPiece;
  const node = captionedBlock(entries, at, entry);
  if (node) {
    setCaption(node, entry.text);
    reading.warnings.add('caption-numbered');
    entries[at] = null;
  } else {
    if (entry.native) reading.warnings.add('caption-left-out');
    entries[at] = entry.paragraph;
  }
  for (const name of entry.bookmarks) reading.bookmarks.set(name, node ?? entry.paragraph);
}
