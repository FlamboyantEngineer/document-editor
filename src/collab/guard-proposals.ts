import type { Node } from 'prosemirror-model';
import {
  listSuggestions,
  type Suggestion,
  suggestionOfPart,
} from '../engine/suggestion-decisions.js';

interface ProposalIndex {
  readonly list: readonly Suggestion[];
  readonly byId: ReadonlyMap<string, { suggestion: Suggestion; signature: string }>;
  readonly signatures: ReadonlySet<string>;
}

const indexes = new WeakMap<Node, ProposalIndex>();

// The element a suggested block is: its id, or for a holder that has none, such as a table's, the
// id of the element it holds, so one table never reads as another.
function elementOf(node: Node): string {
  const own: unknown = node.attrs.dataId;
  if (typeof own === 'string') return own;
  const held: unknown = node.lastChild?.attrs.dataId;
  return typeof held === 'string' ? `${node.type.name}:${held}` : node.type.name;
}

// The blocks each suggestion marks, by the id of the suggestion their part belongs to (a part
// joined to another by a comment thread is that suggestion's), in document order: each block's kind and element
// id, so a change of the blocks a suggestion holds changes its signature as a change of its text
// does.
function suggestedBlocks(doc: Node): Map<string, string[]> {
  const blocks = new Map<string, string[]>();
  doc.descendants((node) => {
    const id: unknown = node.attrs.suggestionSplitId;
    const kind: unknown = node.attrs.suggestionSplitKind;
    if (typeof id === 'string' && id && typeof kind === 'string') {
      const element = elementOf(node);
      const owner = suggestionOfPart(doc, id) ?? id;
      blocks.set(owner, [...(blocks.get(owner) ?? []), `${kind}:${element}`]);
    }
    return !node.isTextblock;
  });
  return blocks;
}

/** Immutable documents share one linear proposal index across snapshots and permission checks. */
export function readGuardProposals(node: Node): ProposalIndex {
  const previous = indexes.get(node);
  if (previous) return previous;
  const list = listSuggestions(node);
  const blocks = suggestedBlocks(node);
  const byId = new Map<string, { suggestion: Suggestion; signature: string }>();
  const signatures = new Set<string>();
  for (const suggestion of list) {
    const signature = JSON.stringify({
      id: suggestion.id,
      author: suggestion.author,
      inserted: suggestion.inserted,
      deleted: suggestion.deleted,
      formatted: suggestion.formatted,
      blocks: blocks.get(suggestion.id) ?? [],
    });
    byId.set(suggestion.id, { suggestion, signature });
    signatures.add(signature);
  }
  const index = { list, byId, signatures };
  indexes.set(node, index);
  return index;
}
