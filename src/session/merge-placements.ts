import type { StoredNode } from '../model/format/document-format.js';

/** The element and its immediate container in one version. */
export interface Place {
  readonly node: StoredNode;
  readonly parent: string;
  readonly nested: boolean;
}

type Places = ReadonlyMap<string, Place>;
export type PlacementVersions = { base: Places; mine: Places; theirs: Places };
export type MovingSide = 'mine' | 'theirs';

// Each element has at most one parent. Follow each unvisited chain and keep just its cycle.
function parentCycles(parents: ReadonlyMap<string, string>): string[][] {
  const visited = new Set<string>();
  const cycles: string[][] = [];
  for (const key of parents.keys()) {
    if (visited.has(key)) continue;
    const path = new Set<string>();
    let cursor: string | undefined = key;
    while (cursor !== undefined && !visited.has(cursor)) {
      visited.add(cursor);
      path.add(cursor);
      cursor = parents.get(cursor);
    }
    const cycle: string[] = [];
    while (cursor !== undefined && path.delete(cursor)) {
      cycle.push(cursor);
      cursor = parents.get(cursor);
    }
    if (cycle.length > 0) cycles.push(cycle);
  }
  return cycles;
}

function selectedParents(places: PlacementVersions, moves: ReadonlyMap<string, MovingSide>) {
  const parents = new Map<string, string>();
  for (const key of new Set([...places.mine.keys(), ...places.theirs.keys()])) {
    const chosen = moves.get(key);
    const place = chosen
      ? places[chosen].get(key)
      : (places.mine.get(key) ?? places.theirs.get(key));
    if (place?.nested) parents.set(key, place.parent);
  }
  return parents;
}

// The reader's tree is valid, so every combined cycle has a stored move that can stay at its
// reader's placement. Repeat the check because the reader's parent may be in another cycle.
function keepAcyclic(places: PlacementVersions, moves: Map<string, MovingSide>) {
  const parents = selectedParents(places, moves);
  for (let cycles = parentCycles(parents); cycles.length; cycles = parentCycles(parents)) {
    for (const cycle of cycles) {
      const key = cycle.find((each) => moves.get(each) === 'theirs' && places.mine.has(each));
      const place = key === undefined ? undefined : places.mine.get(key);
      if (key === undefined || !place) throw new Error('The merged block placements are circular.');
      moves.set(key, 'mine');
      if (place.nested) parents.set(key, place.parent);
      else parents.delete(key);
    }
  }
}

/** The chosen side for relocated blocks, using the reader's placement to break combined cycles. */
export function mergedPlacements(places: PlacementVersions): ReadonlyMap<string, MovingSide> {
  const moves = new Map<string, MovingSide>();
  let checkCycles = false;
  for (const [key, { parent, nested }] of places.base) {
    const mine = places.mine.get(key);
    const theirs = places.theirs.get(key);
    if (mine && (mine.parent !== parent || mine.nested !== nested)) moves.set(key, 'mine');
    else if (theirs && (theirs.parent !== parent || theirs.nested !== nested)) {
      moves.set(key, 'theirs');
      checkCycles ||= Boolean(mine && theirs.nested);
    }
  }
  if (checkCycles) keepAcyclic(places, moves);
  return moves;
}
