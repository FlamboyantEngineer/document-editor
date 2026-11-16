// What a thread's card tells the host and asks of it: the text a reply starts with, and when a
// reply being written for the reader has been drawn.

import { type RefObject, useEffect, useRef } from 'react';
import type { CommentThread } from '../../host/index.js';

/** Where a reply being written for the reader shows, as the host is told once it is drawn. */
export interface ShownActivity {
  readonly threadId: string;
  readonly entryId: string;
}

/**
 * Tells the host each reply being written for the reader once its row is drawn and painted, once
 * for each card that shows it, so a host may start the work behind it only when the reader sees it.
 */
export function useActivityShown(
  thread: CommentThread,
  {
    onActivityShown,
    card,
  }: {
    onActivityShown: ((shown: ShownActivity) => void) | undefined;
    /** The card that shows the rows. */
    card: RefObject<HTMLElement | null>;
  },
) {
  const told = useRef(new Set<string>());
  const pending = thread.entries
    .filter((entry) => entry.status === 'pending')
    .map((entry) => entry.id)
    .join(' ');
  useEffect(() => {
    const ids = pending.split(' ').filter((id) => id && !told.current.has(id));
    const view = card.current?.ownerDocument.defaultView;
    if (!onActivityShown || !view || !ids.length) return;
    // The first frame comes before the rows are painted, the second after.
    let frame = view.requestAnimationFrame(() => {
      frame = view.requestAnimationFrame(() => {
        for (const entryId of ids) {
          told.current.add(entryId);
          onActivityShown({ threadId: thread.id, entryId });
        }
      });
    });
    return () => view.cancelAnimationFrame(frame);
  }, [pending, onActivityShown, thread.id, card]);
}

/** The text a thread's next reply starts with, as the host gives it for the reader. */
export function replyStartOf(
  thread: CommentThread,
  { me, replyStart }: { me: string; replyStart?: ReplyStart | undefined },
): string | undefined {
  return thread.entries.length ? replyStart?.(thread, me) || undefined : undefined;
}

/** Gives the text a reply starts with in a thread, such as a mention of whom the last one asked. */
export type ReplyStart = (thread: CommentThread, me: string) => string | undefined;
