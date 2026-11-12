// Locked positions: a host marks parts of a document the writer may not change, such as content in
// a workflow state that freezes it. The plugin refuses a writer's change touching a locked
// position, including a change that only marks text or sets a node's attributes; layouts, ids,
// proofing results, remote and system changes pass. The editor's chrome reads the same lock to disable what it offers there.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type EditorState, Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import {
  AddMarkStep,
  AddNodeMarkStep,
  AttrStep,
  RemoveMarkStep,
  RemoveNodeMarkStep,
  ReplaceAroundStep,
  ReplaceStep,
  type Step,
} from 'prosemirror-transform';
import { isLocalEdit } from './transaction-kind.js';

/** How a host locks positions. */
export interface EditLockOptions {
  /** Whether the writer may not change the document at a position. */
  readonly isLocked: (doc: ProseMirrorNode, pos: number) => boolean;
}

type Locked = EditLockOptions['isLocked'];

interface Range {
  readonly from: number;
  readonly to: number;
}

/** The lock a document runs with. */
export const editLockKey = new PluginKey<EditLockOptions>('edit-lock');

// Whether the writer may not change anything in a range: its first and last position, or the
// point it is at when empty, and the inside of every block and inline node it covers, so a step
// spanning a locked block between two open ones is caught.
function isRangeLocked(
  doc: ProseMirrorNode,
  range: { from: number; to: number },
  isLocked: Locked,
) {
  const { from, to } = range;
  if (from >= to) return isLocked(doc, from);
  if (isLocked(doc, from) || isLocked(doc, to - 1)) return true;
  let locked = false;
  doc.nodesBetween(from, to, (node, pos) => {
    if (locked) return false;
    if (!node.isTextblock && !node.isLeaf) return true;
    locked = isLocked(doc, Math.max(from, node.isLeaf ? pos : pos + 1));
    return false;
  });
  return locked;
}

// Comments may be added to locked content: only their highlight changes it.
const COMMENT_MARK = 'comment_highlight';

// The ranges a step changes: what it replaces, the edges a structure change replaces around the
// content it keeps, or the text it marks; a node it sets attributes or marks on by the position
// just inside it. Null for a step the lock does not know, and none for a comment's highlight.
function rangesOf(step: Step, doc: ProseMirrorNode): Range[] | null {
  if (step instanceof ReplaceStep) return [{ from: step.from, to: step.to }];
  if (step instanceof ReplaceAroundStep)
    return [
      { from: step.from, to: step.gapFrom },
      { from: step.gapTo, to: step.to },
    ];
  if (step instanceof AddMarkStep || step instanceof RemoveMarkStep)
    return step.mark.type.name === COMMENT_MARK ? [] : [{ from: step.from, to: step.to }];
  if (
    step instanceof AttrStep ||
    step instanceof AddNodeMarkStep ||
    step instanceof RemoveNodeMarkStep
  ) {
    const inside = doc.nodeAt(step.pos)?.isLeaf === false ? step.pos + 1 : step.pos;
    return [{ from: inside, to: inside }];
  }
  return null;
}

/**
 * Whether a step of a transaction changes a locked position of the document it applies to: any
 * position of a range it replaces, marks or sets attributes on, or the point it inserts at.
 */
export function touchesLock(tr: Transaction, isLocked: Locked): boolean {
  return tr.steps.some((step, index) => {
    const doc = tr.docs[index];
    if (!doc) return false;
    const ranges = rangesOf(step, doc);
    if (ranges) return ranges.some((range) => isRangeLocked(doc, range, isLocked));
    let locked = false;
    step.getMap().forEach((oldStart, oldEnd) => {
      locked ||= isRangeLocked(doc, { from: oldStart, to: oldEnd }, isLocked);
    });
    return locked;
  });
}

/**
 * Whether a change is the writer's own: one the undo history records that is neither remote,
 * derived nor a system change (`transaction-kind.ts`).
 */
export const isWritersChange = (tr: Transaction) =>
  tr.getMeta('addToHistory') !== false && isLocalEdit(tr);

/** The plugin refusing a writer's change to a locked position. */
export function createEditLock(options: EditLockOptions): Plugin<EditLockOptions> {
  return new Plugin<EditLockOptions>({
    key: editLockKey,
    state: { init: () => options, apply: (_, value) => value },
    filterTransaction: (tr) => !isWritersChange(tr) || !touchesLock(tr, options.isLocked),
  });
}

/** Whether a document a state's lock applies to is locked at a position; false without a lock. */
export function isLockedIn(state: EditorState, doc: ProseMirrorNode, pos: number): boolean {
  const lock = editLockKey.getState(state);
  if (!lock) return false;
  return lock.isLocked(doc, Math.max(0, Math.min(pos, doc.content.size)));
}

/** Whether the writer may not change the document at a position; false without a lock. */
export function isPositionLocked(state: EditorState, pos: number): boolean {
  const lock = editLockKey.getState(state);
  if (!lock) return false;
  const at = Math.max(0, Math.min(pos, state.doc.content.size));
  return lock.isLocked(state.doc, at);
}
