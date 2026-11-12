// The hidden view that measures a whole document follows it by the smallest replacement, so the
// blocks around a change keep their nodes, their rendering and their cached measurements.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

/** Moves a view onto a document by the smallest replacement, or onto a new state when that fails. */
export function followDocument(view: EditorView, whole: ProseMirrorNode): void {
  const { state } = view;
  const current = state.doc;
  const start = current.content.findDiffStart(whole.content);
  if (start === null) return;
  const end = current.content.findDiffEnd(whole.content);
  let endA = end?.a ?? current.content.size;
  let endB = end?.b ?? whole.content.size;
  const overlap = start - Math.min(endA, endB);
  if (overlap > 0) {
    endA += overlap;
    endB += overlap;
  }
  // Out of the history, so a plugin such as an edit lock never refuses the ghost's own update.
  const tr = state.tr.replace(start, endA, whole.slice(start, endB)).setMeta('addToHistory', false);
  const next = tr.doc.eq(whole)
    ? state.apply(tr)
    : EditorState.create({ doc: whole, plugins: state.plugins });
  view.updateState(next);
}
