// Positions between the paged projection and the canonical whole document, kept exact as both
// change between layouts. A layout builds the map from the page transform (`mapPosition`); each
// edit made on one document and mirrored onto the other then extends it: the projection step
// inverted and the canonical step, paired as mirrors, so positions inside newly inserted content
// map across too.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { Mapping, type Step, type StepMap } from 'prosemirror-transform';
import { FRAGMENT_RULES, type FragmentRules, joinDocumentPages } from '../model/index.js';
import { type MapDirection, mapPosition, textSide } from './page-positions.js';
import { mapStepRange, mirrorStep } from './projection-steps.js';

/** The positions between a paged projection and the canonical whole document it shows. */
export interface ProjectionMap {
  readonly projection: ProseMirrorNode;
  readonly canonical: ProseMirrorNode;
  /** How many step maps it runs through; it grows with each mirrored edit until the next layout. */
  readonly length: number;
  /** A projection position in the canonical document, as `PageMap.toCanonical`. */
  toCanonical(pos: number, assoc?: -1 | 1): number | null;
  /** A canonical position in the projection, as `PageMap.toProjection`. */
  toProjection(pos: number, assoc?: -1 | 1): number | null;
  /** A step on one document as the same edit on the other; null when it cannot be placed. */
  mapStep(step: Step, direction: MapDirection): Step | null;
  /** The map after the same edit made on both documents: `projection` and `canonical` after it. */
  advance(edit: MirroredEdit): ProjectionMap;
  /** The map after an edit made on the canonical document alone. */
  advanceCanonical(step: Step, canonical: ProseMirrorNode): ProjectionMap;
  /** The map after an edit made on the projection alone, such as a repeated header row's copy. */
  advanceProjection(step: Step, projection: ProseMirrorNode): ProjectionMap;
  /**
   * A step the canonical document took, giving `canonical`, mirrored onto the projection; null
   * when it cannot be placed.
   */
  mirror(step: Step, canonical: ProseMirrorNode): Mirrored | null;
  /**
   * The same map on another instance of its projection document, equal to it, as a transaction
   * that took the same steps holds it.
   */
  on(projection: ProseMirrorNode): ProjectionMap;
}

/** The same edit made on both documents, and both documents after it. */
export interface MirroredEdit {
  readonly projectionStep: Step;
  readonly projection: ProseMirrorNode;
  readonly canonicalStep: Step;
  readonly canonical: ProseMirrorNode;
}

/** A canonical step mirrored onto the projection: the steps it took there, and after them. */
export interface Mirrored {
  readonly steps: readonly Step[];
  readonly projection: ProseMirrorNode;
  readonly map: ProjectionMap;
}

function sameRanges(left: StepMap, right: StepMap): boolean {
  const sizes = (map: StepMap) => {
    const all: number[] = [];
    map.forEach((...ends) => all.push(ends[1] - ends[0], ends[3] - ends[2]));
    return all.join(',');
  };
  return sizes(left) === sizes(right);
}

function mapFrom(
  projection: ProseMirrorNode,
  canonical: ProseMirrorNode,
  forward: Mapping,
): ProjectionMap {
  let backward: Mapping | null = null;
  const positions = () => {
    backward ??= forward.invert();
    return { projection, canonical, forward, backward };
  };
  const extended = (
    maps: { readonly before?: StepMap; readonly after?: StepMap; readonly mirror?: boolean },
    docs: { readonly projection: ProseMirrorNode; readonly canonical: ProseMirrorNode },
  ) => {
    const next = new Mapping();
    if (maps.before) next.appendMap(maps.before);
    next.appendMapping(forward);
    // Paired as mirrors, the canonical map's insertions map back onto the projection's.
    if (maps.after) next.appendMap(maps.after, maps.mirror ? 0 : undefined);
    return mapFrom(docs.projection, docs.canonical, next);
  };
  const map: ProjectionMap = {
    projection,
    canonical,
    length: forward.maps.length,
    toCanonical: (pos, assoc) =>
      mapPosition(positions(), { pos, assoc: assoc ?? textSide(projection, pos) }, 'toCanonical'),
    toProjection: (pos, assoc = 1) => mapPosition(positions(), { pos, assoc }, 'toProjection'),
    mapStep: (step, direction) =>
      mapStepRange(step, {
        direction,
        map: (pos, assoc) => mapPosition(positions(), { pos, assoc }, direction),
        side: (pos) => textSide(projection, pos),
        through: direction === 'toCanonical' ? forward : positions().backward,
      }),
    advance: (edit) => {
      const before = edit.projectionStep.getMap();
      const after = edit.canonicalStep.getMap();
      return extended(
        { before: before.invert(), after, mirror: sameRanges(before, after) },
        { projection: edit.projection, canonical: edit.canonical },
      );
    },
    advanceCanonical: (step, next) =>
      extended({ after: step.getMap() }, { projection, canonical: next }),
    advanceProjection: (step, next) =>
      extended({ before: step.getMap().invert() }, { projection: next, canonical }),
    mirror: (step, next) => mirrorStep(map, { step, canonical: next }),
    on: (next) => (next === projection ? map : mapFrom(next, canonical, forward)),
  };
  return map;
}

/**
 * The map of a paged projection, built from the page transform that joins its pages by `rules`;
 * its `canonical` is the whole document they join into.
 */
export function createProjectionMap(
  projection: ProseMirrorNode,
  rules: FragmentRules = FRAGMENT_RULES,
): ProjectionMap {
  const joined = joinDocumentPages(projection, rules);
  return mapFrom(projection, joined.doc, joined.mapping);
}
