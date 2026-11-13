// What a writer leaves out of a stored document whose suggestions it writes as decided: what a
// suggestion inserts when the suggestions are rejected, and what one deletes when they are
// accepted. A text or inline node is suggested by its insertion or deletion mark; a block, such as
// a figure or a paragraph a suggestion split, by its `suggestionKind`.

import type { StoredNode } from './document-format.js';

/** How a writer writes a document's suggestions: as if accepted or rejected. */
export type SuggestionsMode = 'accepted' | 'rejected';

/** Whether a writer that writes the suggestions as `suggestions` leaves this stored node out. */
export function isLeftOut(node: StoredNode, suggestions: SuggestionsMode): boolean {
  const out = suggestions === 'accepted' ? 'deletion' : 'insertion';
  return node.attrs?.suggestionKind === out || (node.marks ?? []).some((mark) => mark.type === out);
}
