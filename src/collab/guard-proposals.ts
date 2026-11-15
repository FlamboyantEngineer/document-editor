import type { Node } from 'prosemirror-model';
import { listSuggestions, type Suggestion } from '../engine/suggestion-decisions.js';

interface ProposalIndex {
  readonly list: readonly Suggestion[];
  readonly byId: ReadonlyMap<string, { suggestion: Suggestion; signature: string }>;
  readonly signatures: ReadonlySet<string>;
}

const indexes = new WeakMap<Node, ProposalIndex>();

/** Immutable documents share one linear proposal index across snapshots and permission checks. */
export function readGuardProposals(node: Node): ProposalIndex {
  const previous = indexes.get(node);
  if (previous) return previous;
  const list = listSuggestions(node);
  const byId = new Map<string, { suggestion: Suggestion; signature: string }>();
  const signatures = new Set<string>();
  for (const suggestion of list) {
    const signature = JSON.stringify({
      id: suggestion.id,
      author: suggestion.author,
      inserted: suggestion.inserted,
      deleted: suggestion.deleted,
      formatted: suggestion.formatted,
    });
    byId.set(suggestion.id, { suggestion, signature });
    signatures.add(signature);
  }
  const index = { list, byId, signatures };
  indexes.set(node, index);
  return index;
}
