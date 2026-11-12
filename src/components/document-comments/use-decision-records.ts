// Records each decision the editor's own transactions make on the threads of the suggestions it
// decided, whichever way it was made: a card, the context menu, the handle or a host's command.

import type { Transaction } from 'prosemirror-state';
import { useEffect, useLayoutEffect, useRef } from 'react';
import {
  isLocalEdit,
  suggestionDecisionOf,
  type SuggestionDecisionReport,
} from '../../engine/index.js';
import type { ThreadDecision } from './comment-thread-actions.js';
import type { CommentThreads } from './use-comment-threads.js';

/** The transactions an editor applies, to follow. */
export interface TransactionSource {
  subscribe(listener: (tr: Transaction) => void): () => void;
}

/** The decision each thread of a report's suggestions takes, those the decision removed too. */
export function threadDecisions(report: SuggestionDecisionReport): ThreadDecision[] {
  const { decision } = report;
  const decided = report.suggestions.flatMap(({ id, thread }) =>
    thread ? [{ threadId: thread, suggestion: id, decision }] : [],
  );
  const dependents = report.dependents.flatMap(({ suggestion, dependsOn }) =>
    suggestion.thread
      ? [{ threadId: suggestion.thread, suggestion: suggestion.id, decision, dependsOn }]
      : [],
  );
  return [...decided, ...dependents];
}

/** Records a report's decisions on the store, or, while it records none, resolves the threads. */
export function recordDecision(comments: CommentThreads, report: SuggestionDecisionReport): void {
  for (const decision of threadDecisions(report)) {
    const recorded = comments.decide
      ? comments.decide(decision)
      : comments.threads.has(decision.threadId)
        ? comments.setState(decision.threadId, 'resolved')
        : null;
    // A refusal shows on the thread, with Retry while the store records decisions.
    void recorded?.catch(() => undefined);
  }
}

/** Records on the threads the decisions the reader's transactions from `source` make. */
export function useDecisionRecords(
  comments: CommentThreads,
  source: TransactionSource | undefined,
): void {
  const latest = useRef(comments);
  useLayoutEffect(() => {
    latest.current = comments;
  });
  useEffect(
    () =>
      source?.subscribe((tr) => {
        const report = suggestionDecisionOf(tr);
        // Another writer's decision is recorded by that writer's editor.
        if (report && isLocalEdit(tr)) recordDecision(latest.current, report);
      }),
    [source],
  );
}
