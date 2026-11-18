// Lists of one kind that a local change leaves side by side become one list, as when the writer
// deletes the paragraph between two bulleted lists or turns a lifted middle item back into a list
// item; a numbered list joins the one before it only when it carries on its count. A collaborator's change arrives as it is: the writer who made it joined the lists.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import { canJoin } from 'prosemirror-transform';
import { isLocalEdit, isRemoteTransaction } from './transaction-kind.js';

/** Which changes the list joins leave as they are. */
interface ListJoinOptions {
  /** Whether a change came from elsewhere. Defaults to `isRemoteTransaction`. */
  readonly isRemote?: ((tr: Transaction) => boolean) | undefined;
}

const LIST_TYPES: ReadonlySet<string> = new Set(['bullet_list', 'ordered_list']);

const listJoinsKey = new PluginKey('list-joins');

// The positions in the document of the transactions' changes, each as its start and its end.
function changedPositions(transactions: readonly Transaction[]): number[] {
  const positions: number[] = [];
  transactions.forEach((tr, index) => {
    // Mapped through the transactions after this one, onto the document they end at.
    const later = transactions.slice(index + 1);
    const map = (pos: number) => later.reduce((at, next) => next.mapping.map(at), pos);
    tr.mapping.maps.forEach((stepMap, step) => {
      stepMap.forEach((...range) => {
        const [, , start, end] = range;
        const rest = tr.mapping.slice(step + 1);
        positions.push(map(rest.map(start, -1)), map(rest.map(end, 1)));
      });
    });
  });
  return positions;
}

// Whether two siblings are lists of one kind, a numbered one carrying on the other's count.
function sameList(before: ProseMirrorNode, after: ProseMirrorNode) {
  if (before.type !== after.type || !LIST_TYPES.has(before.type.name)) return false;
  if (before.type.name !== 'ordered_list') return true;
  return Number(after.attrs.order) === Number(before.attrs.order) + before.childCount;
}

// The boundaries between two lists of one kind beside a position, at each depth around it.
function joinsAround(doc: ProseMirrorNode, pos: number, found: Set<number>) {
  const $pos = doc.resolve(pos);
  for (let depth = $pos.depth; depth >= 0; depth--) {
    const parent = $pos.node(depth);
    const index = $pos.index(depth);
    for (const at of [index - 1, index]) {
      if (at < 1 || at >= parent.childCount) continue;
      if (!sameList(parent.child(at - 1), parent.child(at))) continue;
      const boundary = $pos.posAtIndex(at, depth);
      if (canJoin(doc, boundary)) found.add(boundary);
    }
  }
}

/**
 * Joins the lists of one kind a local change leaves side by side into one list, in the same undo
 * step as the change (DOCE-EDITING-2.2).
 */
export function createListJoins({ isRemote = isRemoteTransaction }: ListJoinOptions = {}) {
  return new Plugin({
    key: listJoinsKey,
    appendTransaction(transactions, _old, state) {
      const local = transactions.filter((tr) => isLocalEdit(tr, isRemote));
      if (local.length === 0) return null;
      const found = new Set<number>();
      for (const pos of changedPositions(transactions)) {
        joinsAround(state.doc, Math.max(0, Math.min(pos, state.doc.content.size)), found);
      }
      if (found.size === 0) return null;
      const tr = state.tr;
      // From the last, so each join leaves the boundaries before it where they were.
      [...found].sort((a, b) => b - a).forEach((boundary) => tr.join(boundary));
      return tr;
    },
  });
}
