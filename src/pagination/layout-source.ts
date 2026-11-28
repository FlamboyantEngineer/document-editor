// The state the pages are laid out from: the canonical document with the plugins that change what
// takes room, held without a view, since nothing drawn is measured (DOCE-PAGINATION-7.17). It
// follows the canonical document by the smallest replacements, so the blocks around a change keep
// their nodes, and the layout engine its results for them.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState, type Transaction } from 'prosemirror-state';
import { markRemote } from '../engine/transaction-kind.js';
import { diffFragments } from '../utils/fragment-diff.js';

// A node of the state's document and where its content starts.
interface Placed {
  readonly node: ProseMirrorNode;
  readonly pos: number;
}

// Replaces the range of a node's content that differs from the target's content.
function replaceDifference(tr: Transaction, from: Placed, to: ProseMirrorNode) {
  const diff = diffFragments(from.node.content, to.content);
  if (!diff) return;
  const { start, endA, endB } = diff;
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
 * Moves a state onto a document by the smallest replacements, node by node where the two documents
 * pair up, so its plugins map what they hold rather than build it again; or a new state with the
 * same plugins when that fails. `restart` starts the plugins' states over first, as after a value
 * a plugin shows changed.
 */
export function followDocument(
  from: EditorState,
  whole: ProseMirrorNode,
  restart = false,
): EditorState {
  const state = restart ? EditorState.create({ doc: from.doc, plugins: from.plugins }) : from;
  if (state.doc.eq(whole)) return state;
  // A remote change, out of the history: no plugin such as an edit lock refuses it, and none that
  // derives writes from the writer's edits, such as the page regions' reset, writes into it.
  const tr = markRemote(state.tr);
  patchContent(tr, { node: state.doc, pos: 0 }, whole);
  const applied = tr.doc.eq(whole) ? state.apply(tr) : null;
  // The layout reads exactly the document it follows: a state a plugin changed is not used.
  return applied?.doc.eq(whole)
    ? applied
    : EditorState.create({ doc: whole, plugins: state.plugins });
}
