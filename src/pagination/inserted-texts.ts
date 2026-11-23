// The words other plugins draw in the pages' text blocks as widgets that are not the document's
// content, such as the deleted words a version comparison marks up in place: each widget marks
// its word in its spec (`insertedText`). The layout engine lays them out on the block's lines
// with its content, word by word, and the forced lines draw each line's break between two of
// them (DOCE-PAGINATION-11.11).

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorState, PluginKey } from 'prosemirror-state';
import { type Decoration, DecorationSet } from 'prosemirror-view';
import { insertedKey, type InsertedText } from '../layout-engine/inserted-text.js';

/** What a widget drawing an inserted word has in its spec. */
interface InsertedSpec {
  /** The word, with the white space after it. */
  readonly insertedText?: unknown;
  /** The text the word is part of: the words of one text are laid out together. */
  readonly insertedGroup?: unknown;
  /** Whether it is a deleted block's text, on lines of its own before or after the content. */
  readonly alone?: unknown;
  readonly side?: unknown;
}

/** The words inserted in a state's text blocks, by block. */
export interface InsertedTexts {
  /** Each text block's inserted words, by node. */
  readonly byBlock: ReadonlyMap<ProseMirrorNode, readonly InsertedText[]>;
  /** The top-level blocks of the pages that hold inserted words outside a text block. */
  readonly outside: ReadonlySet<ProseMirrorNode>;
  /** All of them as one key: decorations kept with other words are drawn again. */
  readonly key: string;
}

/** No inserted words. */
export const NO_INSERTED: InsertedTexts = { byBlock: new Map(), outside: new Set(), key: '' };

const drawsInserted = (spec: InsertedSpec) => typeof spec.insertedText === 'string';

// The widgets found in a set, kept by the set: a plugin whose set is unchanged is not read again.
const found = new WeakMap<DecorationSet, Decoration[]>();

function widgetsIn(set: DecorationSet): Decoration[] {
  let widgets = found.get(set);
  if (!widgets) {
    widgets = set.find(undefined, undefined, drawsInserted);
    found.set(set, widgets);
  }
  return widgets;
}

// The widgets drawing inserted words that a state's plugins draw, but for those of `skip`.
function insertedWidgets(state: EditorState, skip: readonly PluginKey[]): Decoration[] {
  const skipped = new Set(skip.map((key) => key.get(state)));
  return state.plugins.flatMap((plugin) => {
    if (skipped.has(plugin)) return [];
    const set: unknown = plugin.props.decorations?.call(plugin, state);
    return set instanceof DecorationSet ? widgetsIn(set) : [];
  });
}

// The top-level block of a page's content that holds a position.
function topLevelBlock(state: EditorState, pos: number): ProseMirrorNode | null {
  const $pos = state.doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth -= 1)
    if ($pos.node(depth - 1).type.name === 'page_content') return $pos.node(depth);
  return null;
}

/** The words inserted in a state's text blocks by its plugins' widgets, but for `skip`'s. */
export function insertedTexts(state: EditorState, skip: readonly PluginKey[] = []): InsertedTexts {
  const widgets = insertedWidgets(state, skip);
  if (!widgets.length) return NO_INSERTED;
  const groups = new Map<string, { node: ProseMirrorNode; offset: number; words: Decoration[] }>();
  const outside = new Set<ProseMirrorNode>();
  for (const widget of widgets) {
    const pos = Math.min(widget.from, state.doc.content.size);
    const $pos = state.doc.resolve(pos);
    if (!$pos.parent.isTextblock) {
      const block = topLevelBlock(state, pos);
      if (block) outside.add(block);
      continue;
    }
    const spec = widget.spec as InsertedSpec;
    const key = `${String(pos)}|${String(spec.insertedGroup ?? spec.alone ?? '')}`;
    const group = groups.get(key) ?? { node: $pos.parent, offset: pos - $pos.start(), words: [] };
    group.words.push(widget);
    groups.set(key, group);
  }
  const byBlock = new Map<ProseMirrorNode, InsertedText[]>();
  for (const { node, offset, words } of groups.values()) {
    const specs = words.map((word) => word.spec as InsertedSpec);
    const sides = specs.map((spec) => (typeof spec.side === 'number' ? spec.side : 0));
    const order = sides.map((_, index) => index).sort((a, b) => (sides[a] ?? 0) - (sides[b] ?? 0));
    const alone = specs[0]?.alone;
    byBlock.set(node, [
      ...(byBlock.get(node) ?? []),
      {
        offset,
        pieces: order.map((index) => String(specs[index]?.insertedText ?? '')),
        sides: order.map((index) => sides[index] ?? 0),
        ...(alone === 'before' || alone === 'after' ? { alone } : {}),
      },
    ]);
  }
  // Texts at one offset in drawing order, as their sides go.
  for (const texts of byBlock.values())
    texts.sort((a, b) => a.offset - b.offset || (a.sides[0] ?? 0) - (b.sides[0] ?? 0));
  const key = [...byBlock.values()].map((each) => insertedKey(each)).join('/');
  return { byBlock, outside, key: `${key}/${String(outside.size)}` };
}
