// A footnote is read at its first marker, while entries retain the position of the text itself.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { documentRegions, type RegionKind } from '../schema/document-structure.js';

interface NoteBody {
  readonly node: ProseMirrorNode;
  readonly pos: number;
  readonly parent: ProseMirrorNode;
}

const noteRegions: ReadonlySet<RegionKind> = new Set(['footnotes']);

/** Footnote bodies in the document and which ones have been read. */
export interface CatalogFootnotes {
  take(marker: ProseMirrorNode): NoteBody | undefined;
}

const idOf = (node: ProseMirrorNode): unknown => node.attrs.footnoteId;

export function catalogFootnotes(doc: ProseMirrorNode): CatalogFootnotes {
  const bodies = new Map<string, NoteBody>();
  for (const region of documentRegions(doc, noteRegions)) {
    region.node.forEach((node, offset) => {
      const id = idOf(node);
      if (typeof id !== 'string' || !id || bodies.has(id)) return;
      bodies.set(id, { node, pos: region.pos + 1 + offset, parent: region.node });
    });
  }
  return {
    take(marker) {
      const id = idOf(marker);
      if (typeof id !== 'string') return undefined;
      const note = bodies.get(id);
      bodies.delete(id);
      return note;
    },
  };
}
