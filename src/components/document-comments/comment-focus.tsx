// The comment the reader was taken to, such as by a link to it: its thread, the comment to point at
// and a reply to start with. The margin, the comments panel and the editor's handle inside one
// thread state share it, so opening a thread shows it wherever the threads are shown.

import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';

/** Where to take the reader: a thread, and optionally one of its comments and a reply to start. */
export interface ThreadTarget {
  readonly threadId: string;
  /** The comment to point the reader at. */
  readonly entryId?: string | undefined;
  /** A reply to start writing, in the thread's composer. */
  readonly reply?: string | undefined;
}

/** The opened comment, numbered so opening the same one again shows it again. */
export interface OpenedComment extends ThreadTarget {
  readonly sequence: number;
}

/** What a thread being started begins with. */
export interface StartCommentOptions {
  /** The text its opening comment begins with. */
  readonly text?: string | undefined;
}

/** Starts a thread on the selected text, or the caret's block. */
export type StartComment = (options?: StartCommentOptions) => void;

/** Takes the reader to a thread; false when the threads hold no such thread. */
export type OpenComment = (target: ThreadTarget) => boolean;

/** The comment the reader was taken to, and how to take them to another. */
export interface CommentFocus {
  readonly opened: OpenedComment | null;
  open(target: ThreadTarget): void;
  /** The text the thread being started begins with. */
  readonly newText: string | null;
  setNewText(text: string | null): void;
}

const CommentFocusContext = createContext<CommentFocus | null>(null);

const NO_FOCUS: CommentFocus = {
  opened: null,
  open: () => undefined,
  newText: null,
  setNewText: () => undefined,
};

/** Keeps the opened comment for the margin, the panel and the handle inside it. */
export function CommentFocusProvider({ children }: { readonly children: ReactNode }) {
  const [opened, setOpened] = useState<OpenedComment | null>(null);
  const [newText, setNewText] = useState<string | null>(null);
  const focus = useMemo<CommentFocus>(
    () => ({
      opened,
      open: (target) =>
        setOpened((current) => ({ ...target, sequence: (current?.sequence ?? 0) + 1 })),
      newText,
      setNewText,
    }),
    [opened, newText],
  );
  return <CommentFocusContext value={focus}>{children}</CommentFocusContext>;
}

/** The opened comment of the nearest thread state; none outside one. */
export function useCommentFocus(): CommentFocus {
  return useContext(CommentFocusContext) ?? NO_FOCUS;
}
