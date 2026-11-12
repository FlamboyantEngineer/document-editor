// The comment store the host keeps a document's threads in, and the records it keeps.

import type { HostResult } from './adapters.js';

/** One comment of a thread: the opening comment or a reply. */
export interface CommentEntry {
  id: string;
  /** The id of the person who wrote it. */
  author: string;
  text: string;
  /** When it was posted: an ISO 8601 date and time. */
  createdAt: string;
  /** When its text was last changed, if it was. */
  editedAt?: string | undefined;
  /** The people who reacted to it, by the emoji they reacted with. */
  reactions?: Record<string, string[]> | undefined;
  /**
   * A reply still being written for the reader, such as an assistant's (`pending`), or one that
   * could not be (`failed`, with why in `text`), which the reader may cancel or retry.
   */
  status?: 'pending' | 'failed' | undefined;
}

/** A stretch of a thread's text: offsets inside the text block with this element id. */
export interface CommentTargetRange {
  readonly element: string;
  readonly start: number;
  readonly end: number;
  /** The text of the stretch when the thread was anchored. */
  readonly text: string;
}

/** Where a thread's text is, portably, to find it again without its marks. */
export interface CommentTarget {
  readonly ranges: readonly CommentTargetRange[];
  readonly quote: string;
}

/** What a suggestion a thread discusses does, as it was when the thread was started or updated. */
export interface CommentChange {
  kind: 'insert' | 'delete' | 'replace' | 'format';
  inserted?: string | undefined;
  deleted?: string | undefined;
}

/** How a suggestion a thread discusses was decided, by whom and when. */
export interface CommentDecision {
  decision: 'accept' | 'reject';
  suggestion: string;
  /** The person who decided it. */
  by: string;
  /** When: an ISO 8601 date and time. */
  at: string;
  /** The suggestion whose decision took this one with it, as when rejecting the text it was in. */
  dependsOn?: string | undefined;
}

/** A comment thread on a document, anchored to its text or to a suggestion. */
export interface CommentThread {
  /** The thread's id, which the document's anchor names. The editor chooses it. */
  id: string;
  state: 'open' | 'resolved';
  /** The text the thread was started on. */
  quote: string;
  /** The suggestion the thread discusses, when it does. */
  suggestion: string | null;
  /** The opening comment, then the replies, oldest first. */
  entries: CommentEntry[];
  /** About part of the text (the default) or about the whole document, with no anchor. */
  scope?: 'text' | 'document' | undefined;
  /** Where its text is, to find it again without its marks, as in a shared room. */
  target?: CommentTarget | null | undefined;
  /** Who started it; the author of its opening comment by default. */
  author?: string | undefined;
  /** When it was started and last changed: ISO 8601 dates and times. */
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
  /** Who resolved it and when, while it is resolved. */
  resolvedBy?: string | undefined;
  resolvedAt?: string | undefined;
  /** What its suggestion does, for a thread that discusses one. */
  change?: CommentChange | null | undefined;
  /** How its suggestion was decided, once it was. */
  decision?: CommentDecision | null | undefined;
  /** Whether the editor started it for a suggestion, rather than a reader. */
  automatic?: boolean | undefined;
  /** The people who reacted to the thread as a whole, by the emoji they reacted with. */
  reactions?: Record<string, string[]> | undefined;
}

/** A thread to start: its id, what it quotes, its opening comment, and its suggestion. */
export interface NewCommentThread {
  id: string;
  quote: string;
  /** The opening comment; empty for a thread the editor starts for a suggestion. */
  text: string;
  suggestion?: string | null | undefined;
  scope?: CommentThread['scope'];
  target?: CommentThread['target'];
  change?: CommentThread['change'];
  automatic?: boolean | undefined;
}

/** What someone is doing in a thread now, such as writing a reply. */
export interface CommentActivity {
  threadId: string;
  person: string;
  kind: 'typing';
}

/**
 * Where a document's comment threads are kept. The store attributes each comment to the reader
 * and returns the thread as it is after the change.
 */
export interface CommentStoreAdapter {
  list(documentId: string, signal?: AbortSignal): Promise<HostResult<CommentThread[]>>;
  create(documentId: string, thread: NewCommentThread): Promise<HostResult<CommentThread>>;
  reply(documentId: string, threadId: string, text: string): Promise<HostResult<CommentThread>>;
  setState(
    documentId: string,
    threadId: string,
    state: CommentThread['state'],
  ): Promise<HostResult<CommentThread>>;
  remove(documentId: string, threadId: string): Promise<HostResult<null>>;
  /** Changes the text of the reader's own comment. */
  edit?(
    documentId: string,
    change: { threadId: string; entryId: string; text: string },
  ): Promise<HostResult<CommentThread>>;
  /** Deletes the reader's own reply. */
  removeEntry?(
    documentId: string,
    entry: { threadId: string; entryId: string },
  ): Promise<HostResult<CommentThread>>;
  /** Adds or takes back the reader's reaction to a comment, or to the thread without `entryId`. */
  react?(
    documentId: string,
    reaction: { threadId: string; entryId?: string | undefined; emoji: string; reacted: boolean },
  ): Promise<HostResult<CommentThread>>;
  /**
   * Records how the thread's suggestion was decided, by the reader and now, and resolves the
   * thread.
   */
  decide?(
    documentId: string,
    decision: Pick<CommentDecision, 'decision' | 'suggestion' | 'dependsOn'> & { threadId: string },
  ): Promise<HostResult<CommentThread>>;
  /** Changes what a thread is about: its quote, target or change, as its suggestion changes. */
  update?(
    documentId: string,
    threadId: string,
    change: Partial<Pick<CommentThread, 'quote' | 'target' | 'change'>>,
  ): Promise<HostResult<CommentThread>>;
  /** Cancels a pending reply, or retries a failed one. */
  settleEntry?(
    documentId: string,
    entry: { threadId: string; entryId: string; action: 'cancel' | 'retry' },
  ): Promise<HostResult<CommentThread>>;
  /** Tells others the reader is writing in a thread, or has stopped. */
  setTyping?(documentId: string, threadId: string, isTyping: boolean): void;
  /** Calls `onActivity` with what others are doing in a document's threads, until unsubscribed. */
  subscribeActivity?(
    documentId: string,
    onActivity: (activity: CommentActivity[]) => void,
  ): () => void;
  /**
   * Calls `onThreads` with a document's threads whenever they change, by the reader or anyone
   * else, until the returned function is called.
   */
  subscribe?(documentId: string, onThreads: (threads: CommentThread[]) => void): () => void;
}
