// The hidden view that measures a whole document follows it by the smallest replacements, so the
// blocks around a change keep their nodes, their rendering and their cached measurements.

import type { Fragment, Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

// A node of the view's document and where its content starts.
interface Placed {
  readonly node: ProseMirrorNode;
  readonly pos: number;
}

// Replaces the range of a node's content that differs from the target's content.
function replaceDifference(tr: Transaction, from: Placed, to: ProseMirrorNode) {
  const a: Fragment = from.node.content;
  const b: Fragment = to.content;
  const start = a.findDiffStart(b);
  if (start === null) return;
  const end = a.findDiffEnd(b);
  let endA = end?.a ?? a.size;
  let endB = end?.b ?? b.size;
  const overlap = start - Math.min(endA, endB);
  if (overlap > 0) {
    endA += overlap;
    endB += overlap;
  }
  tr.replace(from.pos + start, from.pos + endA, to.slice(start, endB));
}

// Moves a node's content onto the target's: child by child while they pair up, later children
// first so the earlier ones' positions stay put, otherwise by the range that differs.
function patchContent(tr: Transaction, from: Placed, to: ProseMirrorNode) {
  const a = from.node;
  if (a.content === to.content) return;
  if (a.childCount !== to.childCount || a.inlineContent) {
    replaceDifference(tr, from, to);
    return;
  }
  let offsetA = a.content.size;
  for (let index = a.childCount - 1; index >= 0; index -= 1) {
    const childA = a.child(index);
    const childB = to.child(index);
    offsetA -= childA.nodeSize;
    if (childA === childB) continue;
    const pos = from.pos + offsetA;
    if (childA.type !== childB.type) {
      tr.replaceWith(pos, pos + childA.nodeSize, childB);
      continue;
    }
    // Only the attributes differ at this level, such as a page number in a header.
    if (!childA.hasMarkup(childB.type, childB.attrs, childB.marks)) {
      tr.setNodeMarkup(pos, null, childB.attrs, childB.marks);
    }
    patchContent(tr, { node: childA, pos: pos + 1 }, childB);
  }
}

/**
 * Moves a view onto a document by the smallest replacements, node by node where the two documents
 * pair up, or onto a new state when that fails.
 */
export function followDocument(view: EditorView, whole: ProseMirrorNode): void {
  const { state } = view;
  if (state.doc.eq(whole)) return;
  // Out of the history, so a plugin such as an edit lock never refuses the ghost's own update.
  const tr = state.tr.setMeta('addToHistory', false);
  patchContent(tr, { node: state.doc, pos: 0 }, whole);
  const next = tr.doc.eq(whole)
    ? state.apply(tr)
    : EditorState.create({ doc: whole, plugins: state.plugins });
  view.updateState(next);
}
