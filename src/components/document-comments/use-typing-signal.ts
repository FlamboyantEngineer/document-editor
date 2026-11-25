// Tells the store while the reader writes a reply in a thread (`setTyping`), so others see who is
// writing: once a draft has text, and again, as stopped, when it is posted, emptied, left alone for
// a while, or its composer goes.

import { type RefObject, useCallback, useEffect, useRef } from 'react';

/** How long a draft left alone still counts as being written, in milliseconds. */
export const TYPING_IDLE_MS = 4000;

type SetTyping = (threadId: string, isTyping: boolean) => void;

/**
 * Tells `setTyping` when the reader starts and stops writing in a thread's composer: the composer's
 * `onChange`, and `stop` for its submit. Without a store that takes it or a thread, it does nothing.
 */
export function useTypingSignal(
  setTyping: SetTyping | null,
  threadId: string | undefined,
  composer: RefObject<HTMLElement | null>,
): { onChange: (value: string) => void; stop: () => void } {
  // The latest way to tell the store, which a thread's actions may make again on each render.
  const tell = useRef(setTyping);
  useEffect(() => {
    tell.current = setTyping;
  }, [setTyping]);
  const typing = useRef<{ timer: number | null; view: Window | null } | null>(null);
  const stop = useCallback(() => {
    const was = typing.current;
    if (!was || !threadId) return;
    typing.current = null;
    if (was.timer !== null) was.view?.clearTimeout(was.timer);
    tell.current?.(threadId, false);
  }, [threadId]);
  // A composer that goes, or moves to another thread, stops writing in the one before.
  useEffect(() => stop, [stop]);
  const onChange = useCallback(
    (value: string) => {
      if (!threadId || !tell.current) return;
      if (!value.trim()) {
        stop();
        return;
      }
      const view = composer.current?.ownerDocument.defaultView ?? null;
      const was = typing.current;
      if (!was) tell.current(threadId, true);
      else if (was.timer !== null) was.view?.clearTimeout(was.timer);
      typing.current = { view, timer: view ? view.setTimeout(stop, TYPING_IDLE_MS) : null };
    },
    [threadId, stop, composer],
  );
  return { onChange, stop };
}
