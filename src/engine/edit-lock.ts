// Locked positions: a host marks parts of a document the writer may not change, such as content in
// a workflow state that freezes it. The plugin refuses a writer's change touching a locked
// position; layouts, ids, proofing results and remote changes, which stay out of the undo history,
// pass. The editor's chrome reads the same lock to disable what it offers there.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type EditorState, Plugin, PluginKey, type Transaction } from 'prosemirror-state';

/** How a host locks positions. */
export interface EditLockOptions {
  /** Whether the writer may not change the document at a position. */
  readonly isLocked: (doc: ProseMirrorNode, pos: number) => boolean;
}

/** The lock a document runs with. */
export const editLockKey = new PluginKey<EditLockOptions>('edit-lock');

// Whether a step of a transaction changes a locked position of the document it applies to: the
// first and the last character it replaces, or the point it inserts at.
function touchesLock(tr: Transaction, isLocked: EditLockOptions['isLocked']): boolean {
  return tr.mapping.maps.some((map, index) => {
    const doc = tr.docs[index];
    if (!doc) return false;
    let locked = false;
    map.forEach((oldStart, oldEnd) => {
      const last = oldEnd > oldStart ? oldEnd - 1 : oldStart;
      locked ||= isLocked(doc, oldStart) || isLocked(doc, last);
    });
    return locked;
  });
}

/** Whether a change is the writer's own: one the undo history records. */
const isWritersChange = (tr: Transaction) =>
  tr.docChanged && tr.getMeta('addToHistory') !== false && !tr.getMeta('appendedTransaction');

/** The plugin refusing a writer's change to a locked position. */
export function createEditLock(options: EditLockOptions): Plugin<EditLockOptions> {
  return new Plugin<EditLockOptions>({
    key: editLockKey,
    state: { init: () => options, apply: (_, value) => value },
    filterTransaction: (tr) => !isWritersChange(tr) || !touchesLock(tr, options.isLocked),
  });
}

/** Whether the writer may not change the document at a position; false without a lock. */
export function isPositionLocked(state: EditorState, pos: number): boolean {
  const lock = editLockKey.getState(state);
  if (!lock) return false;
  const at = Math.max(0, Math.min(pos, state.doc.content.size));
  return lock.isLocked(state.doc, at);
}
