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

/** The history's undo or redo. */
export type HistoryDirection = 'undo' | 'redo';

/** What a state's lock holds: how the host locks positions, and the undo it last refused. */
export interface EditLockState extends EditLockOptions {
  /**
   * The undo or redo of the history the lock was found to refuse (`undoCommand`), until the
   * history has another change to offer; else null.
   */
  readonly refused: HistoryDirection | null;
}

type Locked = EditLockOptions['isLocked'];

interface Range {
  readonly from: number;
  readonly to: number;
}

/**
 * The lock a document runs with. A transaction with this meta, an undo or a redo by name, reports
 * that the lock refuses what the history offers there.
 */
export const editLockKey = new PluginKey<EditLockState>('edit-lock');

// A host can lock an individual character or an inline object. A block's opening token
// also changes that block when a structural step touches only the token.
function isRangeLocked(doc: ProseMirrorNode, range: Range, isLocked: Locked): boolean {
  const { from, to } = range;
  for (let pos = from; pos < Math.max(from + 1, to); pos += 1) {
    if (isLocked(doc, pos)) return true;
  }
  return from < to && doc.nodeAt(to - 1)?.isTextblock === true && isLocked(doc, to);
}

// Comments may be added to locked content: only their highlight changes it.
const COMMENT_MARK = 'comment_highlight';

// Whether a structure change only sets the type or the attributes of the node around the content
// it keeps (`setNodeMarkup`): it replaces that node's two tokens with one empty node.
function isRetyping(step: ReplaceAroundStep): boolean {
  const { slice } = step;
  const around = step.gapFrom - step.from === 1 && step.to - step.gapTo === 1;
  return around && slice.size === 2 && slice.openStart === 0 && slice.openEnd === 0;
}

// The ranges a structure change changes: the edges it replaces around the content it keeps, and
// that content too when the change moves it into or out of a block, as a wrap, a lift and an
// indent do. Their edges are points between blocks, which no lock of a block covers, yet the
// block reads differently afterwards. A block retyped around its content changes only itself.
function structureRanges(step: ReplaceAroundStep): Range[] {
  const edges = [
    { from: step.from, to: step.gapFrom },
    { from: step.gapTo, to: step.to },
  ];
  return isRetyping(step) ? edges : [...edges, { from: step.gapFrom, to: step.gapTo }];
}

// The ranges a step changes: what it replaces, what a structure change replaces and moves, or the
// text it marks; a node it sets attributes or marks on by the position just inside it. Null for a
// step the lock does not know, and none for a comment's highlight.
function rangesOf(step: Step, doc: ProseMirrorNode): Range[] | null {
  if (step instanceof ReplaceStep) return [{ from: step.from, to: step.to }];
  if (step instanceof ReplaceAroundStep) return structureRanges(step);
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
 * Whether a step of a transaction, from its step `fromStep` on, changes a locked position of the
 * document it applies to: any position of a range it replaces, marks or sets attributes on, of the
 * content a structure change moves into or out of a block, or the point it inserts at.
 */
export function touchesLock(tr: Transaction, isLocked: Locked, fromStep = 0): boolean {
  return tr.steps.slice(fromStep).some((step, offset) => {
    const doc = tr.docs[fromStep + offset];
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

/** Whether a lock refuses a transaction: a writer's change that touches a locked position. */
export const isRefusedBy = (lock: EditLockOptions, tr: Transaction): boolean =>
  isWritersChange(tr) && touchesLock(tr, lock.isLocked);

// The refused undo a transaction leaves: the one it reports, or none once a change the history
// records gives it another to offer; a change kept out of the history leaves the same one on offer.
function refusedAfter(tr: Transaction, value: EditLockState): EditLockState {
  const reported = tr.getMeta(editLockKey) as HistoryDirection | undefined;
  const recorded = tr.docChanged && tr.getMeta('addToHistory') !== false;
  const refused = reported ?? (recorded ? null : value.refused);
  return refused === value.refused ? value : { ...value, refused };
}

/** The plugin refusing a writer's change to a locked position. */
export function createEditLock(options: EditLockOptions): Plugin<EditLockState> {
  return new Plugin<EditLockState>({
    key: editLockKey,
    state: { init: () => ({ ...options, refused: null }), apply: refusedAfter },
    filterTransaction: (tr) => !isRefusedBy(options, tr),
  });
}

/** Whether the writer may not change the document at a position; false without a lock. */
export function isPositionLocked(state: EditorState, pos: number): boolean {
  const lock = editLockKey.getState(state);
  if (!lock) return false;
  const at = Math.max(0, Math.min(pos, state.doc.content.size));
  return lock.isLocked(state.doc, at);
}

/** Whether the edit lock protects any part of a range. */
export function isEditRangeLocked(state: EditorState, range: Range, doc = state.doc): boolean {
  const lock = editLockKey.getState(state);
  return lock !== undefined && isRangeLocked(doc, range, lock.isLocked);
}
