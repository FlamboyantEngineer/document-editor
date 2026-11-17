// The footnote entries a change of a room's content suggests or takes back with their markers
// (DOCE-COLLAB-6.6, DOCE-SUGGESTIONS-1.5): a footnote is suggested by its marker, and its entry
// follows the marker, so the entry comes with a marker suggested in the change and goes with one.

import type { Node } from 'prosemirror-model';

/** The writers of a change's suggested footnotes, by footnote id, for entries that come and go. */
export interface FootnoteSuggestions {
  readonly come: ReadonlyMap<string, string | null>;
  readonly gone: ReadonlyMap<string, string | null>;
}

const footnoteIdOf = (node: Node): string | null => {
  const id: unknown = node.attrs.footnoteId;
  return typeof id === 'string' && id ? id : null;
};

// Each footnote a document cites, by id, with the writer of the insertion its marker is in, if any.
function markers(doc: Node): Map<string, { suggested: boolean; author: string | null }> {
  const found = new Map<string, { suggested: boolean; author: string | null }>();
  doc.descendants((node) => {
    if (node.type.name !== 'footnote_reference') return !node.isText;
    const id = footnoteIdOf(node);
    const insertion = node.marks.find((mark) => mark.type.name === 'insertion');
    const author: unknown = insertion?.attrs.dataAuthor;
    if (id && !found.has(id))
      found.set(id, {
        suggested: Boolean(insertion),
        author: typeof author === 'string' ? author : null,
      });
    return false;
  });
  return found;
}

/**
 * The footnotes a change suggests, whose marker it inserts as a suggestion, and those whose
 * suggested marker it takes away, each with the writer of its marker's insertion.
 */
export function readFootnoteSuggestions(before: Node, after: Node): FootnoteSuggestions {
  const was = markers(before);
  const is = markers(after);
  const come = new Map<string, string | null>();
  const gone = new Map<string, string | null>();
  for (const [id, marker] of is) if (marker.suggested && !was.has(id)) come.set(id, marker.author);
  for (const [id, marker] of was) if (marker.suggested && !is.has(id)) gone.set(id, marker.author);
  return { come, gone };
}

/** The footnote a footnote entry belongs to, or null for any other node. */
export const entryFootnote = (node: Node): string | null =>
  node.type.name === 'footnote_entry' ? footnoteIdOf(node) : null;

/** An inline node as stored, without its mark set or a footnote's number, which each editor sets. */
export function storedInline(node: Node): Node {
  const bare = node.mark([]);
  return bare.attrs.footnoteNumber == null
    ? bare
    : bare.type.create({ ...bare.attrs, footnoteNumber: null }, bare.content);
}
