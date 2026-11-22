// Writing helpers a host may turn on: a paragraph kept at the end of each section's content so the
// writer can always type after a table or a figure there, and a limit on the words or characters
// the document's body holds. Both act on local changes only; a collaborator's arrive as they are.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type EditorState, Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import {
  countTextWords,
  documentRegions,
  documentSections,
  type RegionKind,
  sectionRegions,
} from '../model/index.js';
import { isPositionLocked } from './edit-lock.js';
import {
  isInlineTextOnly,
  isLocalEdit,
  isRemoteTransaction,
  markDerived,
} from './transaction-kind.js';

/** How many words and characters a document's body holds. */
export interface DocumentCounts {
  readonly words: number;
  /** Its text's characters, an inline object counting one. */
  readonly characters: number;
}

/** The most words, characters or both a document's body may hold. */
export interface ContentLimit {
  readonly words?: number | undefined;
  readonly characters?: number | undefined;
}

/** Which changes the helpers leave as they are. */
export interface WritingHelperOptions {
  /** Whether a change came from elsewhere. Defaults to `isRemoteTransaction`. */
  readonly isRemote?: ((tr: Transaction) => boolean) | undefined;
}

const BODY_REGIONS: ReadonlySet<RegionKind> = new Set(['content', 'footnotes']);

// A textblock's text, with each inline object one character, set apart by spaces.
function inlineText(node: ProseMirrorNode): string {
  let text = '';
  node.forEach((child) => {
    if (child.isText) text += child.text ?? '';
    else text += child.childCount > 0 ? ` ${inlineText(child)} ` : '￼';
  });
  return text;
}

const blockCounts = new WeakMap<ProseMirrorNode, DocumentCounts>();

// A block's counts, counted once for each block node.
function countsOf(block: ProseMirrorNode): DocumentCounts {
  const known = blockCounts.get(block);
  if (known) return known;
  let counts: DocumentCounts = { words: 0, characters: 0 };
  if (block.isTextblock) {
    const text = inlineText(block);
    counts = { words: countTextWords(text), characters: text.length };
  } else {
    block.forEach((child) => {
      const inner = countsOf(child);
      counts = {
        words: counts.words + inner.words,
        characters: counts.characters + inner.characters,
      };
    });
  }
  blockCounts.set(block, counts);
  return counts;
}

/**
 * The words and characters of a document's body and footnotes, without page headers and footers;
 * a long document is counted again only where it changed.
 */
export function documentCounts(doc: ProseMirrorNode): DocumentCounts {
  let words = 0;
  let characters = 0;
  for (const region of documentRegions(doc, BODY_REGIONS)) {
    region.node.forEach((block) => {
      const counts = countsOf(block);
      words += counts.words;
      characters += counts.characters;
    });
  }
  return { words, characters };
}

const isOver = (counts: DocumentCounts, limit: ContentLimit) =>
  (limit.words !== undefined && counts.words > limit.words) ||
  (limit.characters !== undefined && counts.characters > limit.characters);

/** The content limit a state's editing keeps, or null when it keeps none. */
export const contentLimitKey = new PluginKey<ContentLimit>('content-limit');

/** The limit the state keeps, as a counter shows it. */
export const contentLimitOf = (state: EditorState): ContentLimit | null =>
  contentLimitKey.getState(state) ?? null;

/**
 * Keeps the document's body within a limit of words or characters: a local change that would take
 * it past the limit, or further past it, is refused; a change that shortens it always applies.
 */
export function createContentLimit(
  limit: ContentLimit,
  { isRemote = isRemoteTransaction }: WritingHelperOptions = {},
): Plugin<ContentLimit> {
  return new Plugin<ContentLimit>({
    key: contentLimitKey,
    state: { init: () => limit, apply: (_tr, value) => value },
    filterTransaction(tr, state) {
      if (!tr.docChanged || isRemote(tr)) return true;
      if (tr.doc.content.size <= state.doc.content.size) return true;
      const after = documentCounts(tr.doc);
      if (!isOver(after, limit)) return true;
      const before = documentCounts(state.doc);
      return after.words <= before.words && after.characters <= before.characters;
    },
  });
}

// The empty paragraphs to add, at the ends of the content regions whose last block is no paragraph.
function missingParagraphs(doc: ProseMirrorNode): number[] {
  return documentRegions(doc, new Set(['content']))
    .filter(({ node }) => node.lastChild && node.lastChild.type.name !== 'paragraph')
    .map(({ node, pos }) => pos + node.nodeSize - 1);
}

/**
 * Keeps an empty paragraph at the end of each section's content when it would otherwise end with a
 * table, a figure or another block that is no paragraph, after each of the writer's own edits: not
 * after a remote, derived or system change, and not where the edit lock holds the section's end.
 * The paragraph is a derived change, so it is no suggestion and no undo step of its own.
 */
export function createTrailingParagraph({
  isRemote = isRemoteTransaction,
}: WritingHelperOptions = {}): Plugin {
  return new Plugin({
    appendTransaction(transactions: readonly Transaction[], _old, state) {
      const edited = transactions.some(
        (tr) => isLocalEdit(tr, isRemote) && tr.getMeta('addToHistory') !== false,
      );
      if (!edited) return null;
      const paragraph = state.schema.nodes.paragraph;
      const ends = missingParagraphs(state.doc).filter((end) => !isPositionLocked(state, end));
      if (!paragraph || ends.length === 0) return null;
      const tr = state.tr;
      for (const end of ends.toReversed()) tr.insert(end, paragraph.create());
      return markDerived(tr);
    },
  });
}

const CONTENT: ReadonlySet<RegionKind> = new Set(['content']);
const sectionFillKey = new PluginKey('section-fill');

// Where an empty paragraph goes in each section the writer may edit whose content holds no block:
// inside its first content region.
function emptySections(doc: ProseMirrorNode): number[] {
  return documentSections(doc).flatMap((section) => {
    if (section.node.attrs.editable === false) return [];
    const regions = sectionRegions(section, CONTENT);
    const first = regions[0];
    return first && regions.every(({ node }) => node.childCount === 0) ? [first.pos + 1] : [];
  });
}

/**
 * Keeps an empty paragraph in each section the writer may edit, so a writer's own edit that takes
 * every block out of a section, such as a delete across sections, leaves the section as reading
 * its stored form back gives it (DOCE-FORMAT-1.1): one empty paragraph, to type in. Not after a
 * remote, derived or system change, whose writer's own editor adds it, and not where the edit lock
 * holds the section. The paragraph is part of the edit's undo step.
 */
export function createSectionFill({
  isRemote = isRemoteTransaction,
}: WritingHelperOptions = {}): Plugin {
  return new Plugin({
    key: sectionFillKey,
    appendTransaction(transactions: readonly Transaction[], _old, state) {
      // Typing inside a text block takes no block out, so it walks no section.
      const edited = transactions.some(
        (tr) =>
          isLocalEdit(tr, isRemote) &&
          tr.getMeta('addToHistory') !== false &&
          !isInlineTextOnly(tr),
      );
      if (!edited) return null;
      const paragraph = state.schema.nodes.paragraph;
      const at = emptySections(state.doc).filter((pos) => !isPositionLocked(state, pos));
      if (!paragraph || at.length === 0) return null;
      const tr = state.tr;
      for (const pos of at.toReversed()) tr.insert(pos, paragraph.create());
      return tr;
    },
  });
}
