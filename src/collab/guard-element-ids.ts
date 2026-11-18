import type { Node } from 'prosemirror-model';

// The element ids each document holds more than once, read once for each immutable reading.
const shared = new WeakMap<Node, ReadonlySet<string>>();

function sharedIdsOf(doc: Node): ReadonlySet<string> {
  const known = shared.get(doc);
  if (known) return known;
  const seen = new Set<string>();
  const twice = new Set<string>();
  doc.descendants((node) => {
    const id: unknown = node.attrs.dataId;
    if (typeof id === 'string' && id) {
      if (seen.has(id)) twice.add(id);
      else seen.add(id);
    }
  });
  shared.set(doc, twice);
  return twice;
}

/**
 * Whether the content after a change holds an element id twice that the content before held
 * once or not at all: a block whose id copies another's, which a writer can send and two honest
 * moves of one block can merge into (DOCE-COLLAB-7.5).
 */
export function sharesNewElementId(before: Node | null, after: Node | null): boolean {
  if (!after) return false;
  const old = before ? sharedIdsOf(before) : new Set<string>();
  for (const id of sharedIdsOf(after)) if (!old.has(id)) return true;
  return false;
}
