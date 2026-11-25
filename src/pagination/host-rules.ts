// The host's layout rules and views as the pages' engine reads them (DOCE-PAGINATION-14.1): a
// block a host's view draws is measured as drawn unless the host's rule sizes it, and the blocks
// laid out with other rules' sizes are laid out again.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { createRuleSizes, ruleSizesKey } from '../layout-engine/rule-sizes.js';
import { REFUSED_TEXT_ATOMS, TEXT_ATOMS } from '../layout-engine/text-atoms.js';
import type { TextLayout } from '../layout-engine/text-layout.js';
import type { InsertedTexts } from './inserted-texts.js';
import type { NodeNumbers } from './node-numbers.js';
import type { TextEngineOptions } from './text-engine-types.js';

// Whether a block is one a host draws with a node view of its own, or holds one: it takes the room
// that view shows, which only drawing it tells, so it is measured as drawn.
function holdsHostBlock(node: ProseMirrorNode, host: ReadonlySet<string>): boolean {
  if (host.size === 0) return false;
  let found = host.has(node.type.name);
  node.descendants((child) => {
    found ||= child.isBlock && host.has(child.type.name);
    return !found && !child.isTextblock;
  });
  return found;
}

// Why a block is left to be measured as drawn before the engine lays it out, or null: words
// inserted outside a text block take room the engine cannot lay out, and a host's view the room it
// shows.
export function refusedAsDrawn(
  node: ProseMirrorNode,
  inserted: InsertedTexts,
  hostViews: ReadonlySet<string>,
): string | null {
  if (inserted.outside.has(node)) return 'inserted words outside a text block';
  return holdsHostBlock(node, hostViews) ? 'drawn by a host view' : null;
}

/**
 * The host's layout rules as the engine reads them: the host's views measured as drawn, less those
 * its rules size (DOCE-PAGINATION-14.1). Read before each block is laid out; when the rules' sizes
 * changed since the last read, `changed` is told first, so nothing laid out with them is kept.
 */
export function watchedRules(options: TextEngineOptions, changed: () => void) {
  let seen = ruleSizesKey(options.layoutRules?.());
  return {
    hostViews() {
      const rules = options.layoutRules?.();
      const now = ruleSizesKey(rules);
      if (now !== seen) {
        seen = now;
        changed();
      }
      return new Set((options.hostViews ?? []).filter((type) => !rules?.[type]?.size));
    },
  };
}

/** The sizes of the host's nodes its layout rules size, with text measured by the engine's layout. */
export function hostRuleSizes(options: TextEngineOptions, text: () => TextLayout) {
  return createRuleSizes({
    rules: options.layoutRules ?? (() => undefined),
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
