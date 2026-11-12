// Pasting where footnotes have rules (D13): a footnote entry is one run of text, so what lands in it
// is flattened; and a marker lands only where a footnote may be cited.

import { Fragment, type Node as ProseMirrorNode, type NodeType, Slice } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import { canInsertFootnote, citingPlacesOf, isFootnoteMarker } from './footnote-model.js';

// The inline content an entry takes, marks it does not allow left out.
function fitsEntry(node: ProseMirrorNode, entry: NodeType): ProseMirrorNode | null {
  if (isFootnoteMarker(node) || !entry.contentMatch.matchType(node.type)) return null;
  return node.mark(node.marks.filter((mark) => entry.allowsMarkType(mark.type)));
}

// The runs of inline content of a fragment: each text block's, and inline nodes at its top level.
function inlineRuns(fragment: Fragment, entry: NodeType): ProseMirrorNode[][] {
  const runs: ProseMirrorNode[][] = [[]];
  fragment.forEach((node) => {
    if (node.isInline) {
      const fitted = fitsEntry(node, entry);
      if (fitted) runs[runs.length - 1]?.push(fitted);
    } else if (node.isTextblock) {
      runs.push(inlineRuns(node.content, entry).flat(), []);
    } else {
      runs.push(...inlineRuns(node.content, entry), []);
    }
  });
  return runs.filter((run) => run.length > 0);
}

// A fragment with the markers in blocks that may not cite a footnote left out.
function dropMarkers(fragment: Fragment, places: ReadonlySet<string> | null): Fragment {
  const kept: ProseMirrorNode[] = [];
  fragment.forEach((node) => {
    if (isFootnoteMarker(node) && places === null) return;
    if (node.isLeaf || node.isInline) {
      kept.push(node);
      return;
    }
    const name = node.type.name;
    const inner = node.isTextblock
      ? name === 'paragraph'
        ? places
        : null
      : places?.has(name)
        ? places
        : null;
    kept.push(node.copy(dropMarkers(node.content, inner)));
  });
  return Fragment.from(kept);
}

/**
 * Repairs content pasted where footnotes have rules: into a footnote entry, it becomes one run of
 * text, its blocks joined by a space, with no markers; elsewhere, footnote markers are kept only in
 * the paragraphs that may cite a footnote (`canInsertFootnote`, the plugin's `citingPlaces`). The
 * paste pipeline runs it on each slice; it returns the slice as it is when nothing needs repair.
 */
export function flattenFootnotePaste(slice: Slice, state: EditorState): Slice {
  const { $from } = state.selection;
  const entry = state.schema.nodes.footnote_entry;
  if (entry && $from.parent.type === entry) {
    const space = state.schema.text(' ');
    const runs = inlineRuns(slice.content, entry);
    return new Slice(
      Fragment.from(runs.flatMap((run, index) => (index > 0 ? [space, ...run] : run))),
      0,
      0,
    );
  }
  const places = canInsertFootnote(state) ? citingPlacesOf(state) : null;
  const content = dropMarkers(slice.content, places);
  return content.eq(slice.content) ? slice : new Slice(content, slice.openStart, slice.openEnd);
}
