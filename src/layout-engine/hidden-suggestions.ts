// The suggestions a markup hides (DOCE-PAGINATION-11.12): as if accepted, the suggested deletions
// take no room; as if rejected, the suggested insertions take none. The engine lays a block out
// without them, as the markup's stylesheet hides them and a print of the markup leaves them out.

import type { Node as ProseMirrorNode } from 'prosemirror-model';

/** How the pages show suggestions: all their markup, as if accepted, or as if rejected. */
export type SuggestionMarkup = 'all' | 'final' | 'original';

/** The suggestion mark a markup hides; null when it shows them all. */
export function hiddenSuggestion(markup: SuggestionMarkup): string | null {
  if (markup === 'final') return 'deletion';
  if (markup === 'original') return 'insertion';
  return null;
}

/** Whether an inline node is in a suggestion the mark names, which takes no room. */
export const isHidden = (node: ProseMirrorNode, hidden: string | null | undefined) =>
  Boolean(hidden) && node.marks.some((mark) => mark.type.name === hidden);

// Whether a block holds a suggested insertion or deletion, kept by node.
const holding = new WeakMap<ProseMirrorNode, boolean>();
const SUGGESTIONS: ReadonlySet<string> = new Set(['insertion', 'deletion']);

function holdsSuggestion(node: ProseMirrorNode): boolean {
  let holds = holding.get(node);
  if (holds === undefined) {
    let found = false;
    node.descendants((child) => {
      found ||= child.marks.some((mark) => SUGGESTIONS.has(mark.type.name));
      return !found;
    });
    holds = found;
    holding.set(node, holds);
  }
  return holds;
}

/**
 * What a block laid out in a markup is kept by beside its other keys: the markup, for a block
 * holding a suggestion the markup may hide; nothing for another, which every markup lays out alike.
 */
export function suggestionKey(
  node: ProseMirrorNode,
  markup: (() => SuggestionMarkup) | undefined,
): string {
  return holdsSuggestion(node) ? (markup?.() ?? 'all') : '';
}
