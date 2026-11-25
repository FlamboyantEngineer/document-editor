// The figure and table boxes block geometry tells while a block is laid out for them
// (DOCE-PAGINATION-10.12): written down only while asked, so laying out the pages keeps none.

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
    /** The boxes told while `lay` lays a block out. */
    boxesOf(lay: () => unknown): ReadonlyMap<ProseMirrorNode, ObjectBox> {
      const found = new Map<ProseMirrorNode, ObjectBox>();
      boxes = found;
      try {
        lay();
      } finally {
        boxes = null;
      }
      return found;
    },
  };
}
