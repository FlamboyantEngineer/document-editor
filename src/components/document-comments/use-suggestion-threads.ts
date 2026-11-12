// Threads the editor starts for the reader's own suggestions, so each suggestion can be discussed
// and decided on its thread: planned once the reader pauses, then kept to what the suggestion does
// as it changes.

import type { Command, EditorState } from 'prosemirror-state';
import { useEffect, useLayoutEffect, useRef } from 'react';
import {
  createElementId,
  linkSuggestionThread,
  listSuggestions,
  type Suggestion,
} from '../../engine/index.js';
import type { CommentChange, CommentThread } from '../../host/index.js';
import type { DocumentCommentsOptions } from './document-comments.js';
import type { CommentThreads } from './use-comment-threads.js';

/** What the editor does to keep the threads of the reader's suggestions. */
export interface SuggestionThreadPlan {
  /** Suggestions of the reader's with no thread yet, with the thread to start for each. */
  readonly start: readonly { suggestion: Suggestion; quote: string; change: CommentChange }[];
  /** Threads the editor started whose suggestion now does something else. */
  readonly update: readonly { threadId: string; quote: string; change: CommentChange }[];
}

// How long the reader pauses before the threads follow their suggestions, by default.
const DEFAULT_DELAY = 800;

/** What a suggestion does, as its thread records it. */
export function suggestionChange({ inserted, deleted }: Suggestion): CommentChange {
  if (inserted && deleted) return { kind: 'replace', inserted, deleted };
  return inserted ? { kind: 'insert', inserted } : { kind: 'delete', deleted };
}

const sameChange = (a: CommentChange | null | undefined, b: CommentChange) =>
  a?.kind === b.kind &&
  (a.inserted ?? '') === (b.inserted ?? '') &&
  (a.deleted ?? '') === (b.deleted ?? '');

/**
 * The threads to start for the reader's suggestions without one, and the threads the editor
 * started to bring up to date; another writer's suggestions are theirs to plan.
 */
export function planSuggestionThreads(
  suggestions: readonly Suggestion[],
  { threads, me }: { threads: ReadonlyMap<string, CommentThread>; me: string },
): SuggestionThreadPlan {
  const start: SuggestionThreadPlan['start'][number][] = [];
  const update: SuggestionThreadPlan['update'][number][] = [];
  for (const suggestion of suggestions) {
    const change = suggestionChange(suggestion);
    const quote = suggestion.inserted || suggestion.deleted;
    const thread = suggestion.thread ? threads.get(suggestion.thread) : undefined;
    if (!suggestion.thread && suggestion.author === me) start.push({ suggestion, quote, change });
    else if (thread?.automatic && thread.state === 'open' && !sameChange(thread.change, change))
      update.push({ threadId: thread.id, quote, change });
  }
  return { start, update };
}

// Links a suggestion to its thread outside the reader's history: undoing their edit should not
// first undo the link.
const linkQuietly =
  (suggestion: string, thread: string): Command =>
  (state, dispatch) =>
    linkSuggestionThread(suggestion, thread)(state, (tr) =>
      dispatch?.(tr.setMeta('addToHistory', false)),
    );

/**
 * Starts a thread for each of the reader's suggestions once they pause, and keeps the threads it
 * started to what their suggestions do, while the margin's `suggestionThreads` asks.
 */
export function useSuggestionThreads({
  state,
  comments,
  run,
  options,
}: {
  state: EditorState;
  comments: CommentThreads;
  run: (command: Command) => void;
  options: Pick<DocumentCommentsOptions, 'suggestionThreads' | 'identity'>;
}): void {
  const asked = options.suggestionThreads;
  const delay = asked ? ((asked === true ? null : asked.delay) ?? DEFAULT_DELAY) : null;
  const me = options.identity.currentPerson().id;
  const latest = useRef({ comments, run });
  useLayoutEffect(() => {
    latest.current = { comments, run };
  });
  // The suggestions whose threads are being started, so a later pause does not start another.
  const starting = useRef(new Set<string>());
  const { doc } = state;
  const { threads } = comments;
  useEffect(() => {
    if (delay === null) return undefined;
    const timer = setTimeout(() => {
      const plan = planSuggestionThreads(listSuggestions(doc), { threads, me });
      const { comments: current, run: runNow } = latest.current;
      for (const { suggestion, quote, change } of plan.start) {
        if (starting.current.has(suggestion.id)) continue;
        starting.current.add(suggestion.id);
        const id = createElementId();
        const thread = { id, quote, text: '', suggestion: suggestion.id, change, automatic: true };
        void current
          .create(thread)
          .then(() => runNow(linkQuietly(suggestion.id, id)))
          .catch(() => undefined)
          .finally(() => starting.current.delete(suggestion.id));
      }
      for (const { threadId, quote, change } of plan.update)
        void current.update?.(threadId, { quote, change }).catch(() => undefined);
    }, delay);
    return () => clearTimeout(timer);
  }, [doc, threads, me, delay]);
}
