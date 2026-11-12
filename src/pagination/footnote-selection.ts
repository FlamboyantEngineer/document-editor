// A selection in a footnote entry, kept across a layout that moves the entry to another page.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type EditorState, TextSelection, type Transaction } from 'prosemirror-state';

/** Where a selection lies in a footnote entry: the entry's id and the selection's ends in it. */
export interface FootnoteAnchor {
  readonly id: string;
  readonly anchor: number;
  readonly head: number;
}

/** The footnote entry a selection lies in, with its ends from the entry's start. */
export function footnoteAnchor({ selection }: EditorState): FootnoteAnchor | null {
  const { $from, $to } = selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name !== 'footnote_entry') continue;
    const id = node.attrs.footnoteId as unknown;
    if (typeof id !== 'string' || !id || $to.node(depth) !== node) return null;
    const start = $from.start(depth);
    return { id, anchor: selection.anchor - start, head: selection.head - start };
  }
  return null;
}

function findFootnoteEntry(doc: ProseMirrorNode, id: string) {
  const found: { node: ProseMirrorNode; pos: number }[] = [];
  doc.descendants((node, pos) => {
    if (found.length) return false;
    if (node.type.name === 'footnote_entry' && node.attrs.footnoteId === id)
      found.push({ node, pos });
    return !found.length;
  });
  return found[0] ?? null;
}

/** Puts a selection back in its footnote entry when the entry moved to another page. */
export function restoreFootnoteSelection(tr: Transaction, anchor: FootnoteAnchor | null): void {
  if (!anchor || footnoteAnchor({ selection: tr.selection } as EditorState)?.id === anchor.id) {
    return;
  }
  const entry = findFootnoteEntry(tr.doc, anchor.id);
  if (!entry) return;
  const size = entry.node.content.size;
  const at = (offset: number) => entry.pos + 1 + Math.min(Math.max(offset, 0), size);
  tr.setSelection(TextSelection.create(tr.doc, at(anchor.anchor), at(anchor.head)));
}
