// The figure and table boxes block geometry tells while a block is laid out (DOCE-PAGINATION-10.12),
// written down only while asked.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { ObjectBox } from '../layout-engine/blocks/types.js';

/** Writes down the object boxes a layout tells while `boxesOf` runs one. */
export function createObjectRecorder() {
  let boxes: Map<ProseMirrorNode, ObjectBox> | null = null;
  return {
    /** Block geometry's `onObject`. */
    record(node: ProseMirrorNode, box: ObjectBox): void {
      boxes?.set(node, box);
    },
    /** What `lay` laid out, and the boxes told while it did. */
    boxesOf<Laid>(lay: () => Laid): { laid: Laid; boxes: ReadonlyMap<ProseMirrorNode, ObjectBox> } {
      const found = new Map<ProseMirrorNode, ObjectBox>();
      const outer = boxes;
      boxes = found;
      try {
        return { laid: lay(), boxes: found };
      } finally {
        boxes = outer;
      }
    },
  };
}
