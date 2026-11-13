// Keeping the blocks a decision on a suggested split keeps: the block as it was, suggested for
// deletion, or its two halves, suggested as insertions (DOCE-SUGGESTIONS-1.4).

import type { Attrs, Node as ProseMirrorNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import { pickIdentityAttrs } from '../model/schema/element-attributes.js';

/** The attributes of the blocks an accepted split removes, by suggestion id, until a half takes them. */
export type ReplacedBlocks = Map<string, Attrs>;

// The identity attributes a suggestion or the layout sets: they are not the element's own.
const notElements = new Set([
  'splitPartIndex',
  'suggestionSplitKind',
  'suggestionSplitId',
  'suggestionFormat',
]);

// The attributes that say which element a block of a type is: its id, its writer and the host's.
function elementIdentity(node: ProseMirrorNode, attrs: Attrs): Attrs {
  return Object.fromEntries(
    Object.entries(pickIdentityAttrs(node.type, attrs)).filter(([name]) => !notElements.has(name)),
  );
}

/**
 * Keeps a suggested block as the document's own, its suggestion attributes cleared. The first half
 * of an accepted split takes the identity of the block it replaces, so the element keeps its id
 * and writer, and what refers to it by id still finds it; the second half is the new element, as
 * after a split made directly.
 */
export function keepSuggestedBlock(
  tr: Transaction,
  { node, pos }: { readonly node: ProseMirrorNode; readonly pos: number },
  replaced: ReplacedBlocks,
): void {
  const split = String(node.attrs.suggestionSplitId);
  const original = replaced.get(split);
  replaced.delete(split);
  tr.setNodeMarkup(pos, null, {
    ...node.attrs,
    ...(original ? elementIdentity(node, original) : {}),
    suggestionSplitKind: null,
    suggestionSplitId: null,
  });
}
