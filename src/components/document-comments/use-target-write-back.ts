// Keeps each stored thread's target and quote to where its text now is: once the writer pauses,
// the threads whose text moved or changed are described again from their anchors and the store
// told, so a reader who finds the threads by their targets (DOCE-COMMENTS-1.12) finds them where
// the text now is.

import type { EditorState } from 'prosemirror-state';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { describeCommentTarget } from '../../engine/index.js';
import type { CommentTarget, CommentThread } from '../../host/index.js';
import type { CommentThreads } from './use-comment-threads.js';

// How long the writer pauses before the targets follow the text.
const DELAY = 800;

const keyOf = (target: CommentTarget) => JSON.stringify([target.quote, target.ranges]);

/** The threads whose anchors now describe another target than the one stored, with that target. */
export function movedTargets(
  state: EditorState,
  threads: ReadonlyMap<string, CommentThread>,
): { threadId: string; target: CommentTarget }[] {
  const moved: { threadId: string; target: CommentTarget }[] = [];
  for (const thread of threads.values()) {
    if (thread.state === 'deleted' || thread.scope === 'document') continue;
    const target = describeCommentTarget(state, thread.id);
    if (!target) continue;
    const stored = thread.target;
    if (stored && keyOf(stored) === keyOf(target) && thread.quote === target.quote) continue;
    moved.push({ threadId: thread.id, target });
  }
  return moved;
}

/**
 * Writes the moved targets back to the store once the writer pauses, while the reader edits the
 * document and the store can change a thread; each target is asked for once, so a store that
 * refuses it is not asked again until the text moves again.
 */
export function useTargetWriteBack({
  state,
  comments,
  editable,
}: {
  state: EditorState;
  comments: CommentThreads;
  editable: boolean;
}): void {
  const latest = useRef(comments);
  useLayoutEffect(() => {
    latest.current = comments;
  });
  const asked = useRef(new Map<string, string>());
  const { threads } = comments;
  const canUpdate = comments.update !== null;
  useEffect(() => {
    if (!editable || !canUpdate) return undefined;
    const timer = setTimeout(() => {
      const { update } = latest.current;
      for (const { threadId, target } of movedTargets(state, threads)) {
        const key = keyOf(target);
        if (asked.current.get(threadId) === key) continue;
        asked.current.set(threadId, key);
        void update?.(threadId, { target, quote: target.quote }).catch(() => undefined);
      }
    }, DELAY);
    return () => clearTimeout(timer);
  }, [state, threads, editable, canUpdate]);
}
