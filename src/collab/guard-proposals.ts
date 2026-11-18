import type { Node } from 'prosemirror-model';
import { listSuggestions, type Suggestion } from '../engine/suggestion-decisions.js';

interface ProposalIndex {
  readonly list: readonly Suggestion[];
  readonly byId: ReadonlyMap<string, { suggestion: Suggestion; signature: string }>;
  readonly signatures: ReadonlySet<string>;
}

const indexes = new WeakMap<Node, ProposalIndex>();

// The blocks each suggestion marks, by its id, in document order: each block's kind and element
// id, so a change of the blocks a suggestion holds changes its signature as a change of its text
// does.
function suggestedBlocks(doc: Node): Map<string, string[]> {
  const blocks = new Map<string, string[]>();
  doc.descendants((node) => {
    const id: unknown = node.attrs.suggestionSplitId;
    const kind: unknown = node.attrs.suggestionSplitKind;
    if (typeof id === 'string' && id && typeof kind === 'string') {
      const element = typeof node.attrs.dataId === 'string' ? node.attrs.dataId : node.type.name;
      blocks.set(id, [...(blocks.get(id) ?? []), `${kind}:${element}`]);
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
