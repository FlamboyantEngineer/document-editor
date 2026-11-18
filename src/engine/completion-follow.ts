// How a question and an offer of inline completion follow a change: the writer's own takes them
// away; one that is not, a collaborator's, a check's or the layout's, leaves them at the caret
// while it stays where they were, and takes them once it moves the caret away or changes the text
// block they were for.

import type { EditorState, Transaction } from 'prosemirror-state';
import { automationActor } from './automation.js';
import { startsCommentDraft } from './comment-draft.js';
import { isLocalEdit } from './transaction-kind.js';

// The writer's own edit or caret move: not a collaborator's, a plugin's, the host's or an agent's
// change, and not a caret that only follows such a change.
function isOwn(tr: Transaction, before: EditorState): boolean {
  if (isLocalEdit(tr) && !automationActor(tr)) return true;
  const { selection } = tr;
  return (
    tr.selectionSet &&
    (!selection.empty || selection.head !== tr.mapping.map(before.selection.head))
  );
}

/** The writer's own change, or a comment they start at the caret, which takes them from the text. */
export const takesWriterAway = (tr: Transaction, before: EditorState): boolean =>
  isOwn(tr, before) || startsCommentDraft(tr);

/** The question asked for a position and the offer at one, while there is either. */
interface HeldCompletion<O extends { readonly pos: number }> {
  readonly asking: number | null;
  readonly offer: O | null;
}

// A position kept through a change, while the caret stays at it.
function follow(tr: Transaction, pos: number): number | null {
  const mapped = tr.mapping.map(pos);
  return tr.selection.empty && tr.selection.head === mapped ? mapped : null;
}

// Whether a change changes the text block at a position, or where the position is in it, so a
// question asked there no longer holds (DOCE-AUTOMATION-3.4).
function changesBlockAt(tr: Transaction, pos: number, before: EditorState): boolean {
  if (!tr.docChanged) return false;
  const $old = before.doc.resolve(pos);
  const $new = tr.doc.resolve(tr.mapping.map(pos));
  return (
    $old.parentOffset !== $new.parentOffset || $old.parent.textContent !== $new.parent.textContent
  );
}

/** The question and the offer after a change that is not the writer's, the same while unchanged. */
export function followChange<O extends { readonly pos: number }>(
  tr: Transaction,
  held: HeldCompletion<O>,
  before: EditorState,
): HeldCompletion<O> {
  const at = held.offer?.pos ?? held.asking;
  if (at !== null && changesBlockAt(tr, at, before)) return { asking: null, offer: null };
  const asking = held.asking === null ? null : follow(tr, held.asking);
  const pos = held.offer && follow(tr, held.offer.pos);
  const offer =
    !held.offer || pos === null
      ? null
      : pos === held.offer.pos
        ? held.offer
        : { ...held.offer, pos };
  return asking === held.asking && offer === held.offer ? held : { asking, offer };
}
