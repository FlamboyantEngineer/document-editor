import type { Node as ProseMirrorNode, ResolvedPos } from 'prosemirror-model';

interface Entry {
  readonly from: number;
  readonly size: number;
  readonly section: number;
  readonly page: number;
}

const entries = new WeakMap<ProseMirrorNode, ReadonlyMap<string, readonly Entry[]>>();

function addPageEntries(
  byId: Map<string, Entry[]>,
  pageNode: ProseMirrorNode,
  place: Pick<Entry, 'section' | 'page' | 'from'>,
) {
  pageNode.forEach((region, offset) => {
    if (region.type.name !== 'page_footnotes') return;
    region.forEach((entry, entryOffset) => {
      const id: unknown = entry.attrs.footnoteId;
      if (typeof id !== 'string' || !id) return;
      const found = {
        ...place,
        from: place.from + offset + entryOffset + 2,
        size: entry.content.size,
      };
      const copies = byId.get(id);
      if (copies) copies.push(found);
      else byId.set(id, [found]);
    });
  });
}

function indexEntries(doc: ProseMirrorNode): ReadonlyMap<string, readonly Entry[]> {
  const byId = new Map<string, Entry[]>();
  doc.forEach((section, sectionPos, index) => {
    if (section.type.name !== 'page_section') return;
    section.forEach((page, pagePos, number) =>
      addPageEntries(byId, page, { section: index, page: number, from: sectionPos + pagePos + 2 }),
    );
  });
  entries.set(doc, byId);
  return byId;
}

/** An entry's visual occurrences, starting at the first position inside each. */
export function footnoteCopies(doc: ProseMirrorNode, id: string): readonly Entry[] {
  return (entries.get(doc) ?? indexEntries(doc)).get(id) ?? [];
}

/** Where a position is inside an entry, including which page has that copy. */
export function footnoteAt($pos: ResolvedPos) {
  for (let depth = $pos.depth; depth >= 4; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.name !== 'footnote_entry') continue;
    const id: unknown = node.attrs.footnoteId;
    if (typeof id !== 'string' || !id) return null;
    const from = $pos.start(depth);
    return {
      id,
      from,
      size: node.content.size,
      offset: $pos.pos - from,
      section: $pos.index(depth - 4),
      page: $pos.index(depth - 3),
    };
  }
  return null;
}

/** The same position in an entry's copy on the same page of another layout, if it survives. */
export function sameFootnoteIn($pos: ResolvedPos, doc: ProseMirrorNode): number | null {
  const note = footnoteAt($pos);
  if (!note) return null;
  const copy = footnoteCopies(doc, note.id).find(
    ({ section, page }) => section === note.section && page === note.page,
  );
  return copy ? copy.from + Math.min(note.offset, copy.size) : null;
}

/** The same position in a different copy of its entry, when the nearby position is in one. */
export function footnoteCopyNear(doc: ProseMirrorNode, pos: number, near: number): number {
  const entry = footnoteAt(doc.resolve(pos));
  const copy = entry && footnoteAt(doc.resolve(near));
  return entry && copy?.id === entry.id ? copy.from + Math.min(entry.offset, copy.size) : pos;
}
