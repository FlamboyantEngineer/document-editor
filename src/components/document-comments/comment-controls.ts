// What the editor reaches the comments by, wherever they show: starting a thread on the selection,
// with Mod-Alt-M, the context menu or the handle, and taking the reader to a thread.

import type { RichTextStateUpdate } from '@flamboyantengineer/ui-components/rich-text-editor';
import type { Command, EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { type RefObject, useContext, useEffect } from 'react';
import {
  canStartComment,
  createElementId,
  startCommentDraft,
  suggestionDecisionOf,
} from '../../engine/index.js';
import { type OpenComment, type StartComment, useCommentFocus } from './comment-focus.js';
import { type CommentThreads, SharedCommentThreadsContext } from './use-comment-threads.js';
import { recordDecision } from './use-decision-records.js';

/** The ways in that the comments give the editor, and what they act on. */
export interface CommentControlsOptions {
  readonly state: EditorState;
  readonly onStateChange: (update: RichTextStateUpdate) => void;
  /**
   * The editor's view: commands go through its dispatch, so the host hears of them and the edit
   * lock applies; without it they change the state directly.
   */
  readonly view?: EditorView | null | undefined;
  readonly canComment: boolean;
  readonly comments: CommentThreads;
  /** Receives the way to start a thread while the reader may comment. */
  readonly startRef?: RefObject<StartComment | null> | undefined;
  /** Receives the way to take the reader to a thread. */
  readonly openRef?: RefObject<OpenComment | null> | undefined;
  /** Called with the key of the card of a thread just started. */
  readonly onStart?: ((key: string) => void) | undefined;
  /** Hears of a thread the reader is taken to. */
  readonly onOpen?: (() => void) | undefined;
}

/**
 * Runs a command through the view's dispatch, else on the latest state the caller holds. A command
 * that decides suggestions has its decision recorded on their threads once: by the provider that
 * follows the view's transactions, or else here, read from a run on the state shown, since the
 * caller may apply it later and outside the editor's transactions.
 */
function useRunCommand(
  { onStateChange, view }: Pick<CommentControlsOptions, 'onStateChange' | 'view'>,
  { state, comments }: { state: EditorState; comments: CommentThreads },
) {
  const isFollowed = useContext(SharedCommentThreadsContext)?.recordsDecisions ?? false;
  return (command: Command) => {
    if (!view || !isFollowed) {
      command(state, (tr) => {
        const report = suggestionDecisionOf(tr);
        if (report) recordDecision(comments, report);
      });
    }
    if (view) {
      command(view.state, view.dispatch, view);
      return;
    }
    onStateChange((current) => {
      let next = current;
      command(current, (tr) => {
        next = current.apply(tr);
      });
      return next;
    });
  };
}

/** Gives the editor its ways in to the comments, and returns the way to start a thread. */
export function useCommentControls(options: CommentControlsOptions) {
  const { state, canComment, comments, startRef, openRef, onStart } = options;
  const focus = useCommentFocus();
  const run = useRunCommand(options, { state, comments });
  // A thread starts as a draft on the selection, or the caret's block, until the store keeps it.
  const startThread: StartComment = (start) => {
    if (!canStartComment(state)) return;
    const id = createElementId();
    focus.setNewText(start?.text ?? null);
    run(startCommentDraft(id));
    onStart?.(`comment:${id}`);
  };
  const open: OpenComment = (target) => {
    if (!comments.threads.has(target.threadId)) return false;
    focus.open(target);
    options.onOpen?.();
    return true;
  };
  useEffect(() => {
    if (startRef) startRef.current = canComment ? startThread : null;
    if (openRef) openRef.current = open;
    return () => {
      if (startRef) startRef.current = null;
      if (openRef) openRef.current = null;
    };
  });
  return { run, startThread };
}
