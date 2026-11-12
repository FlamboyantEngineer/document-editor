// One thread state for a document's comments, shared by the margin, the comments panel and every
// other part inside the provider, so a change made in one shows in the others at once and the
// store lists the threads once.

import { type ReactNode, useMemo } from 'react';
import type { CommentStoreAdapter, IdentityAdapter } from '../../host/index.js';
import { DEFAULT_COMMENTS_LABELS } from './comments-labels.js';
import type { DocumentCommentsOptions } from './document-comments.js';
import {
  SharedCommentThreadsContext,
  useCommentThreads,
  useSharedCommentThreads,
} from './use-comment-threads.js';
import { type TransactionSource, useDecisionRecords } from './use-decision-records.js';

/** The store and document whose threads a provider keeps. */
export interface CommentThreadsProviderProps {
  readonly store: CommentStoreAdapter;
  readonly documentId: string;
  readonly identity: IdentityAdapter;
  /** The message a failed change shows when the store gives none. */
  readonly failed?: string | undefined;
  /** The editor's transactions, whose decisions on suggestions are recorded on their threads. */
  readonly transactions?: TransactionSource | undefined;
  readonly children: ReactNode;
}

/** Keeps a document's threads for every part of the editor inside it. */
export function CommentThreadsProvider({
  children,
  failed = DEFAULT_COMMENTS_LABELS.failed,
  transactions,
  ...options
}: CommentThreadsProviderProps) {
  const threads = useCommentThreads({ ...options, failed });
  useDecisionRecords(threads, transactions);
  const { store, documentId } = options;
  const shared = useMemo(() => ({ store, documentId, threads }), [store, documentId, threads]);
  return <SharedCommentThreadsContext value={shared}>{children}</SharedCommentThreadsContext>;
}

/** Its children inside a provider of the store's threads, unless one around them keeps them. */
export function WithCommentThreads({ children, ...props }: CommentThreadsProviderProps) {
  const { store, documentId, identity, failed, transactions } = props;
  const shared = useSharedCommentThreads(props);
  if (shared) return children;
  return (
    <CommentThreadsProvider
      store={store}
      documentId={documentId}
      identity={identity}
      failed={failed}
      transactions={transactions}
    >
      {children}
    </CommentThreadsProvider>
  );
}

/**
 * The editor's comments, for the parts inside it to share, recording the decisions its
 * transactions make; its children alone without them.
 */
export function EditorCommentThreads({
  comments,
  transactions,
  children,
}: {
  readonly comments: DocumentCommentsOptions | undefined;
  readonly transactions: TransactionSource;
  readonly children: ReactNode;
}) {
  if (!comments) return children;
  return (
    <WithCommentThreads {...comments} failed={comments.labels?.failed} transactions={transactions}>
      {children}
    </WithCommentThreads>
  );
}
