// What the editor reaches the comments by, wherever they show: starting a thread on the selection,
// with Mod-Alt-M, the context menu or the handle, and taking the reader to a thread.

import type { RichTextStateUpdate } from '@flamboyantengineer/ui-components/rich-text-editor';
import type { Command, EditorState } from 'prosemirror-state';
import { type RefObject, useEffect, useMemo } from 'react';
import { canStartComment, createElementId, startCommentDraft } from '../../engine/index.js';
import type { CommentThread } from '../../host/index.js';
import { type OpenComment, type StartComment, useCommentFocus } from './comment-focus.js';

/** The ways in that the comments give the editor, and what they act on. */
export interface CommentControlsOptions {
  readonly state: EditorState;
  readonly onStateChange: (update: RichTextStateUpdate) => void;
  readonly canComment: boolean;
  readonly threads: ReadonlyMap<string, CommentThread>;
  /** Receives the way to start a thread while the reader may comment. */
  readonly startRef?: RefObject<StartComment | null> | undefined;
  /** Receives the way to take the reader to a thread. */
  readonly openRef?: RefObject<OpenComment | null> | undefined;
  /** Called with the key of the card of a thread just started. */
  readonly onStart?: ((key: string) => void) | undefined;
}

/** Runs a command on the latest state the caller holds. */
export function useRunCommand(onStateChange: (update: RichTextStateUpdate) => void) {
  return useMemo(
    () => (command: Command) =>
      onStateChange((current) => {
        let next = current;
        command(current, (tr) => {
          next = current.apply(tr);
        });
        return next;
      }),
    [onStateChange],
  );
}

/** Gives the editor its ways in to the comments, and returns the way to start a thread. */
export function useCommentControls(options: CommentControlsOptions) {
  const { state, canComment, threads, startRef, openRef, onStart } = options;
  const focus = useCommentFocus();
  const run = useRunCommand(options.onStateChange);
  // A thread starts as a draft on the selection, or the caret's block, until the store keeps it.
  const startThread: StartComment = (start) => {
    if (!canStartComment(state)) return;
    const id = createElementId();
    focus.setNewText(start?.text ?? null);
    run(startCommentDraft(id));
    onStart?.(`comment:${id}`);
  };
  const open: OpenComment = (target) => {
    if (!threads.has(target.threadId)) return false;
    focus.open(target);
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
