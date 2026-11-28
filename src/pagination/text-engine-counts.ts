// The counts behind the pages text layout engine's stats (DOCE-LABS-8.11), and the nodes it could
// not lay out, which take no room (DOCE-PAGINATION-14.4).

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { AtomSize } from '../layout-engine/atoms.js';
import type { TextEngineStats } from './text-engine-types.js';

// The most nodes kept in the stats' list of those that could not be laid out.
const REFUSED_KEPT = 100;

/** The nodes the engine could not lay out, each taking no room, counted by why. */
export function createRefusals() {
  const counts = { refused: 0, reasons: new Map<string, number>() };
  const nodes = new Map<string, string>();
  return {
    /** Counts a node that takes no room, by why, and keeps it by its type and element id. */
    refuse: (node: ProseMirrorNode, reason: string) => {
      counts.refused += 1;
      counts.reasons.set(reason, (counts.reasons.get(reason) ?? 0) + 1);
      const id = typeof node.attrs.dataId === 'string' ? node.attrs.dataId : '';
      const key = `${node.type.name}#${id}`;
      nodes.delete(key);
      nodes.set(key, reason);
      if (nodes.size > REFUSED_KEPT) nodes.delete(nodes.keys().next().value ?? '');
    },
    read: () => ({
      refused: counts.refused,
      reasons: new Map(counts.reasons),
      refusedNodes: new Map(nodes),
    }),
  };
}

/** An inline atom nothing sizes, counted as refused: it takes no room. */
export function unsized(
  node: ProseMirrorNode,
  refused: (node: ProseMirrorNode, reason: string) => void,
): AtomSize {
  refused(node, `nothing sizes inline ${node.type.name}`);
  return { width: 0, height: 0 };
}

/**
 * The blocks the engine laid out and could not lay out so far, with why, and the host's layout
 * rules that failed to size a node.
 */
export function createCounts(
  sizeErrors: () => ReadonlyMap<string, string>,
  refusals: ReturnType<typeof createRefusals>,
) {
  let laid = 0;
  return {
    laid: () => {
      laid += 1;
    },
    stats: (): TextEngineStats => ({
      laid,
      ...refusals.read(),
      sizeErrors: new Map(sizeErrors()),
    }),
  };
}
