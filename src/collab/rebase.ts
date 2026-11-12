// Local changes the shared document has not taken yet, moved after changes that reached it first.
// The local steps are undone, the shared document's steps applied, and the local steps applied
// again through the mapping, mirrored against their inverses so positions inside text the local
// steps inserted map exactly. A local step that no longer applies is dropped.

import type { Node } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import { Mapping, type Step } from 'prosemirror-transform';

/** Local steps from a document both sides held, and the shared document's steps since it. */
export interface Rebase {
  /** The document both sides held. */
  readonly base: Node;
  /** The local steps from `base` that the shared document has not taken. */
  readonly local: readonly Step[];
  /** The shared document's steps from `base`. */
  readonly shared: readonly Step[];
}

/**
 * Turns `tr`, on a document that is `base` with the local steps, into one that is `base` with the
 * shared steps and then the local steps rebased. Gives the mapping from the document `tr` started
 * on, with each local step mirrored by its inverse, or `null` when the steps do not apply as
 * recorded, which leaves `tr` to be dropped.
 */
export function rebaseSteps(tr: Transaction, { base, local, shared }: Rebase): Mapping | null {
  const docs: Node[] = [];
  let doc = base;
  for (const step of local) {
    docs.push(doc);
    const applied = step.apply(doc);
    if (!applied.doc) return null;
    doc = applied.doc;
  }
  const mapping = new Mapping();
  for (let index = local.length - 1; index >= 0; index -= 1) {
    const inverted = (local[index] as Step).invert(docs[index] as Node);
    if (tr.maybeStep(inverted).failed) return null;
    mapping.appendMap(inverted.getMap());
  }
  for (const step of shared) {
    if (tr.maybeStep(step).failed) return null;
    mapping.appendMap(step.getMap());
  }
  local.forEach((step, index) => {
    const mirror = local.length - 1 - index;
    const mapped = step.map(mapping.slice(mirror + 1));
    if (mapped && !tr.maybeStep(mapped).failed) mapping.appendMap(mapped.getMap(), mirror);
  });
  return mapping;
}
