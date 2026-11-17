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
interface SuggestionThreadPlan {
  /** Suggestions of the reader's with no thread yet, with the thread to start for each. */
  readonly start: { suggestion: Suggestion; quote: string; change: CommentChange }[];
  /** Threads the editor started whose suggestion now does something else. */
  readonly update: { threadId: string; quote: string; change: CommentChange }[];
  /** Suggestions naming a thread the store does not have, whose thread to start again. */
  readonly recreate: { suggestion: Suggestion; quote: string; change: CommentChange }[];
  /** The reader's open automatic threads whose suggestion went from the document. */
  remove: readonly string[];
}

// How long the reader pauses before the threads follow their suggestions, by default.
const DEFAULT_DELAY = 800;

/** What a suggestion does, as its thread records it: a change of formatting alone is `format`. */
function suggestionChange({ inserted, deleted, formatted }: Suggestion): CommentChange {
  if (inserted && deleted) return { kind: 'replace', inserted, deleted };
  if (inserted) return { kind: 'insert', inserted };
  return !deleted && formatted ? { kind: 'format' } : { kind: 'delete', deleted };
}

const sameChange = (a: CommentChange | null | undefined, b: CommentChange) =>
  a?.kind === b.kind &&
  (a.inserted ?? '') === (b.inserted ?? '') &&
  (a.deleted ?? '') === (b.deleted ?? '');

// Whether a thread is the reader's own open, undecided automatic thread whose suggestion went.
const isLeftBehind = (thread: CommentThread, me: string, gone: ReadonlySet<string>) =>
  Boolean(
    thread.automatic &&
    thread.state === 'open' &&
    (thread.author ?? thread.entries[0]?.author) === me &&
    !thread.decision &&
    thread.suggestion &&
    gone.has(thread.suggestion),
  );

interface PlanOptions {
  readonly threads: ReadonlyMap<string, CommentThread>;
  readonly me: string;
  readonly textOf?: ((suggestion: Suggestion) => string) | undefined;
  /** Whether the store listed its threads, so a thread it lacks is missing, not yet to come. */
  readonly listed?: boolean | undefined;
  /** The suggestions that were in the document at the last pause and no longer are. */
  readonly gone?: ReadonlySet<string> | undefined;
}

// Files one suggestion under what its thread needs: started, updated or started again.
function classify(suggestion: Suggestion, options: PlanOptions, plan: SuggestionThreadPlan): void {
  const { threads, me, textOf } = options;
  const change = suggestionChange(suggestion);
  const quote = suggestion.inserted || suggestion.deleted || (textOf?.(suggestion) ?? '');
  const thread = suggestion.thread ? threads.get(suggestion.thread) : undefined;
  // Any writer's suggestion whose thread went missing gets it back.
  if (suggestion.thread && !thread && options.listed)
    plan.recreate.push({ suggestion, quote, change });
  if (suggestion.author !== me) return;
  if (!suggestion.thread) plan.start.push({ suggestion, quote, change });
  else if (thread?.automatic && thread.state === 'open' && !sameChange(thread.change, change))
    plan.update.push({ threadId: thread.id, quote, change });
}

/**
 * The threads to start for the reader's suggestions without one, and the threads the editor
 * started to bring up to date; another writer's suggestions, and their threads, are theirs to
 * plan. A suggestion that changes formatting alone quotes the text it formats (`textOf`).
 */
export function planSuggestionThreads(
  suggestions: readonly Suggestion[],
  options: PlanOptions,
): SuggestionThreadPlan {
  const plan: SuggestionThreadPlan = { start: [], update: [], recreate: [], remove: [] };
  for (const suggestion of suggestions) classify(suggestion, options, plan);
  const gone = options.gone ?? new Set();
  plan.remove = [...options.threads.values()]
    .filter((thread) => isLeftBehind(thread, options.me, gone))
    .map((thread) => thread.id);
  return plan;
}

// Links a suggestion to its thread outside the reader's history: undoing their edit should not
// first undo the link.
const linkQuietly =
  (suggestion: string, thread: string): Command =>
  (state, dispatch) =>
    linkSuggestionThread(suggestion, thread)(state, (tr) =>
      dispatch?.(tr.setMeta('addToHistory', false)),
    );

type Plan = ReturnType<typeof planSuggestionThreads>;

// Starts, updates, starts again and removes the threads a plan names; a suggestion whose thread is
// being started is left to that start.
function carryOut(
  plan: Plan,
  { comments, run }: { comments: CommentThreads; run: (command: Command) => void },
  starting: Set<string>,
) {
  for (const { suggestion, quote, change } of plan.start) {
    if (starting.has(suggestion.id)) continue;
    starting.add(suggestion.id);
    const id = createElementId();
    const thread = { id, quote, text: '', suggestion: suggestion.id, change, automatic: true };
    void comments
      .create(thread)
      .then(() => run(linkQuietly(suggestion.id, id)))
      .catch(() => undefined)
      .finally(() => starting.delete(suggestion.id));
  }
  for (const { threadId, quote, change } of plan.update)
    void comments.update?.(threadId, { quote, change }).catch(() => undefined);
  for (const { suggestion, quote, change } of plan.recreate) {
    // Asked once: a store refuses an id it holds, a deleted thread's included.
    const id = suggestion.thread;
    if (!id || starting.has(`again:${id}`)) continue;
    starting.add(`again:${id}`);
    const thread = { id, quote, text: '', suggestion: suggestion.id, change, automatic: true };
    void comments.create(thread).catch(() => undefined);
  }
  for (const threadId of plan.remove) void comments.remove(threadId).catch(() => undefined);
}

/**
 * Starts a thread for each of the reader's suggestions once they pause, and keeps the threads it
 * started to what their suggestions do, while the margin's `suggestionThreads` asks. While the
 * reader may edit, a suggestion naming a thread the store lacks gets its thread back, and the
 * reader's automatic thread whose suggestion went from the document (withdrawn or undone) is
 * deleted.
 */
export function useSuggestionThreads({
  state,
  comments,
  run,
  options,
  editable,
}: {
  state: EditorState;
  comments: CommentThreads;
  run: (command: Command) => void;
  options: Pick<DocumentCommentsOptions, 'suggestionThreads' | 'identity'>;
  editable: boolean;
}): void {
  const asked = options.suggestionThreads;
  const delay = asked ? ((asked === true ? null : asked.delay) ?? DEFAULT_DELAY) : null;
  const me = options.identity.currentPerson().id;
  const latest = useRef({ comments, run });
  useLayoutEffect(() => {
    latest.current = { comments, run };
  });
  // The suggestions whose threads are being started, so a later pause does not start another,
  // and those the document held at the last pause.
  const starting = useRef(new Set<string>());
  const seen = useRef<ReadonlySet<string> | null>(null);
  const missing = useRef<ReadonlySet<string>>(new Set());
  const { doc } = state;
  const { threads, listed = false } = comments;
  useEffect(() => {
    if (delay === null) return undefined;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const textOf = ({ from, to }: Suggestion) => doc.textBetween(from, to, ' ');
      const suggestions = listSuggestions(doc);
      const now = new Set(suggestions.map((each) => each.id));
      // Gone at two pauses in a row, so a decision being recorded on its thread meanwhile wins.
      const gone = new Set([...missing.current].filter((id) => !now.has(id)));
      missing.current = new Set([...(seen.current ?? [])].filter((id) => !now.has(id)));
      seen.current = now;
      const plan = planSuggestionThreads(suggestions, {
        threads,
        me,
        textOf,
        listed: listed && editable,
        gone: editable ? gone : new Set(),
      });
      carryOut(plan, latest.current, starting.current);
      // A suggestion just gone is looked at again after another pause.
      if (missing.current.size > 0) timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, delay);
    return () => clearTimeout(timer);
  }, [doc, threads, listed, me, delay, editable]);
}
