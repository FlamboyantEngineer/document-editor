// The host's layout rules and views as the pages' engine reads them (DOCE-PAGINATION-14.1): a
// block a host's view draws takes no room unless the host's rule sizes it, and the blocks laid out
// with other rules' sizes are laid out again.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { createRuleSizes, type RuleSizes, ruleSizesKey } from '../layout-engine/rule-sizes.js';
import { REFUSED_TEXT_ATOMS, TEXT_ATOMS } from '../layout-engine/text-atoms.js';
import type { TextLayout } from '../layout-engine/text-layout.js';
import { LAYOUT_RULES, type LayoutRules } from '../model/pagination/page-layout.js';
import type { InsertedTexts } from './inserted-texts.js';
import type { NodeNumbers } from './node-numbers.js';
import type { TextEngineOptions } from './text-engine-types.js';

// Whether a block is one a host draws with a node view of its own, or holds one: only drawing it
// would tell its room, so without a rule that sizes it, it takes none.
function holdsHostBlock(node: ProseMirrorNode, host: ReadonlySet<string>): boolean {
  if (host.size === 0) return false;
  let found = host.has(node.type.name);
  node.descendants((child) => {
    found ||= child.isBlock && host.has(child.type.name);
    return !found && !child.isTextblock;
  });
  return found;
}

// Why a block takes no room before the engine lays it out, or null: a host's view whose room only
// drawing it tells.
export function refusedAsDrawn(
  node: ProseMirrorNode,
  hostViews: ReadonlySet<string>,
): string | null {
  return holdsHostBlock(node, hostViews) ? 'drawn by a host view' : null;
}

/**
 * Reports words inserted outside a block's text blocks, which take no room: the block is laid out
 * without them (DOCE-PAGINATION-11.11).
 */
export function reportUnplacedWords(
  node: ProseMirrorNode,
  inserted: InsertedTexts,
  refuse: (node: ProseMirrorNode, reason: string) => void,
): void {
  if (inserted.outside.has(node)) refuse(node, 'inserted words outside a text block');
}

/** The layout rules the engine sizes nodes by: the host's, else the library's own (`LAYOUT_RULES`). */
export function rulesOf(options: TextEngineOptions): () => LayoutRules {
  return () => options.layoutRules?.() ?? LAYOUT_RULES;
}

/**
 * The host's layout rules as the engine reads them: the host's views that take no room, less those
 * its rules size (DOCE-PAGINATION-14.1). Read before each block is laid out; when the rules' sizes
 * changed since the last read, `changed` is told first, so nothing laid out with them is kept.
 */
export function watchedRules(options: TextEngineOptions, changed: () => void) {
  const rulesNow = rulesOf(options);
  let seen = ruleSizesKey(rulesNow());
  return {
    hostViews() {
      const rules = rulesNow();
      const key = ruleSizesKey(rules);
      if (key !== seen) {
        seen = key;
        changed();
      }
      return new Set((options.hostViews ?? []).filter((type) => !rules[type]?.size));
    },
  };
}

/** The sizes of the host's nodes its layout rules size, with text measured by the engine's layout. */
export function hostRuleSizes(options: TextEngineOptions, text: () => TextLayout) {
  return createRuleSizes({
    rules: rulesOf(options),
    text,
    language: options.language ?? '',
    markup: () => options.markup?.() ?? 'all',
  });
}

// The inline atoms laid out as their text: those the pages draw as the schema does, not a host's.
function textAtomTypes(options: TextEngineOptions): ReadonlySet<string> {
  const host = new Set(options.hostViews ?? []);
  return new Set([...TEXT_ATOMS].filter((type) => !host.has(type)));
}

/** The inline atoms laid out as text, with the numbers their footnote markers show. */
export function textAtomsOf(options: TextEngineOptions, numbers: () => NodeNumbers) {
  return {
    types: textAtomTypes(options),
    footnoteOf: (marker: ProseMirrorNode) => numbers().footnoteOf(marker),
    refused: options.refusedTextAtoms ?? REFUSED_TEXT_ATOMS,
  };
}

/** The engine's readings of the sized nodes: whether a type is sized and each node's box. */
export const sizedReading = (sizes: RuleSizes) => ({
  sizedType: (node: ProseMirrorNode) => sizes.sizes(node),
  objectOf: (node: ProseMirrorNode) => sizes.placed(node),
  objectsVersion: () => sizes.version(),
});
