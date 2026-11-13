// Pasting where footnotes have rules (D13): a footnote entry is one run of text, so what lands in it
// is flattened; and a marker lands only where a footnote may be cited.

import { Fragment, type Node as ProseMirrorNode, type NodeType, Slice } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import {
  canCiteBeside,
  canInsertFootnote,
  citingPlacesOf,
  isFootnoteMarker,
} from './footnote-model.js';

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

// A fragment with the markers left out of the text block its open start ends in, `depth` levels
// down: that block's text joins the block at the caret, which may not cite them.
function dropJoining(fragment: Fragment, depth: number): Fragment {
  const first = fragment.firstChild;
  if (!first || depth === 0) return fragment;
  const inner = first.isTextblock
    ? dropMarkers(first.content, null)
    : dropJoining(first.content, depth - 1);
  return fragment.replaceChild(0, first.copy(inner));
}

/**
 * Repairs content pasted where footnotes have rules: into a footnote entry, it becomes one run of
 * text, its blocks joined by a space, with no markers; elsewhere, footnote markers are kept only in
 * the paragraphs that may cite a footnote (the plugin's `citingPlaces`). Content that joins the
 * block at the caret, inline content and the text block an open slice starts with, keeps its
 * markers where the caret may cite one (`canInsertFootnote`); the slice's whole blocks land beside
 * that block, and keep theirs where a paragraph there may (`canCiteBeside`). The paste pipeline
 * runs it on each slice; it returns the slice as it is when nothing needs repair.
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
  const places = citingPlacesOf(state);
  const joining = canInsertFootnote(state) ? places : null;
  const beside = canCiteBeside($from, places) ? places : null;
  const inline = slice.content.firstChild?.isInline === true;
  const fitted = dropMarkers(slice.content, inline ? joining : beside);
  const content =
    joining || !$from.parent.isTextblock ? fitted : dropJoining(fitted, slice.openStart);
  return content.eq(slice.content) ? slice : new Slice(content, slice.openStart, slice.openEnd);
}
