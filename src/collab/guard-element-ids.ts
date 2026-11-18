import type { Node } from 'prosemirror-model';
import { ELEMENT_ID_PATTERN, forEachStoredElement } from '../engine/element-ids.js';

// How many nodes hold each id, and how many stored elements hold no well-formed id of their own.
interface ElementIds {
  readonly counts: ReadonlyMap<string, number>;
  readonly unnamed: number;
}

const NONE: ElementIds = { counts: new Map(), unnamed: 0 };

// Read once for each immutable reading.
const readings = new WeakMap<Node, ElementIds>();

function elementIdsOf(doc: Node | null): ElementIds {
  if (!doc) return NONE;
  const known = readings.get(doc);
  if (known) return known;
  // Ids are counted on every node, the drawn regions' too, which a suggestion's blocks may be.
  const counts = new Map<string, number>();
  doc.descendants((node) => {
    const id: unknown = node.attrs.dataId;
    if (typeof id === 'string' && ELEMENT_ID_PATTERN.test(id))
      counts.set(id, (counts.get(id) ?? 0) + 1);
  });
  let unnamed = 0;
  forEachStoredElement(doc, (node) => {
    const id: unknown = node.attrs.dataId;
    if (typeof id !== 'string' || !ELEMENT_ID_PATTERN.test(id)) unnamed += 1;
  });
  const ids = { counts, unnamed };
  readings.set(doc, ids);
  return ids;
}

/**
 * Whether a change leaves the room's element ids worse than it found them (DOCE-COLLAB-7.5): more
 * stored elements without a well-formed id of their own, which no editor sends, or an id on more
 * elements than held it, which a writer can send and two honest moves of one block can merge into.
 * What a stored room already holds is tolerated.
 */
export function hasElementIdFault(before: Node | null, after: Node | null): boolean {
  const old = elementIdsOf(before);
  const now = elementIdsOf(after);
  if (now.unnamed > old.unnamed) return true;
  for (const [id, count] of now.counts)
    if (count > 1 && count > (old.counts.get(id) ?? 0)) return true;
  return false;
}
