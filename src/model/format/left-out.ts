// What a writer leaves out of a stored document by its suggestions: written as if accepted, a
// suggested deletion goes; written as if rejected, a suggested insertion goes. A block suggested
// whole, such as a figure or the halves of a split paragraph, goes with its own block attribute;
// inline content with its insertion or deletion mark. Every writer applies this one rule.

import type { StoredNode } from './document-format.js';

/** How a writer writes a document's suggestions: as if accepted, or as if rejected. */
export type SuggestionsMode = 'accepted' | 'rejected';

// The suggestion kind and mark a writer leaves out in each mode.
const LEFT_OUT: Readonly<Record<SuggestionsMode, { kind: string; mark: string }>> = {
  accepted: { kind: 'deletion', mark: 'deletion' },
  rejected: { kind: 'insertion', mark: 'insertion' },
};

/** Whether a writer leaves a stored node out, as its suggestions are accepted or rejected. */
export function isLeftOut(node: StoredNode, suggestions: SuggestionsMode): boolean {
  const out = LEFT_OUT[suggestions];
  if (node.attrs?.suggestionKind === out.kind) return true;
  return (node.marks ?? []).some((mark) => mark.type === out.mark);
}

/** The nodes of stored content a writer keeps, as its suggestions are accepted or rejected. */
export function keptContent(
  content: readonly StoredNode[] | undefined,
  suggestions: SuggestionsMode,
): StoredNode[] {
  return (content ?? []).filter((node) => !isLeftOut(node, suggestions));
}
