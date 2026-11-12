// The one policy for deciding suggestions: who may accept and reject each one, and a command that
// decides only what the reader may. The margin, the context menu and commands all go through it.

import type { Command } from 'prosemirror-state';
import {
  decideSuggestions,
  listSuggestions,
  type Suggestion,
  suggestionAuthor,
  type SuggestionDecision,
} from './suggestion-decisions.js';
import { suggestionsKey } from './suggestions.js';

/** What a reader may do with a suggestion. */
export interface SuggestionPermissions {
  readonly accept: boolean;
  readonly reject: boolean;
}

/**
 * Who decides suggestions: the one policy every way of deciding goes through, the margin, the
 * context menu and commands alike.
 */
export interface SuggestionPolicy {
  /** The reader, as suggestions name their writers, or null when unknown. */
  readonly me: string | null;
  /** Whether the reader may accept and reject suggestions at all. */
  readonly canDecide: boolean;
  /** Whether the reader may withdraw (reject) their own suggestions, even while suggesting. */
  readonly canWithdraw?: boolean | undefined;
  /** Narrows what a reader who may decide may do with each suggestion. Both by default. */
  readonly decide?: ((suggestion: Suggestion, me: string) => SuggestionPermissions) | undefined;
  /** Who opened a thread, for the writer of a suggestion that records none. */
  readonly threadAuthor?: ((thread: string) => string | null | undefined) | undefined;
}

const EVERYTHING: SuggestionPermissions = { accept: true, reject: true };
const NOTHING: SuggestionPermissions = { accept: false, reject: false };

/**
 * Whether a reader may accept a suggestion, and reject it: as the policy grants a reader who may
 * decide, and a writer may always withdraw their own while they may.
 */
export function suggestionPermissions(
  suggestion: Suggestion,
  policy: SuggestionPolicy,
): SuggestionPermissions {
  const { me } = policy;
  let granted = NOTHING;
  if (policy.canDecide)
    granted = me !== null && policy.decide ? policy.decide(suggestion, me) : EVERYTHING;
  const author = suggestionAuthor(suggestion, policy.threadAuthor ?? (() => null));
  const own = Boolean(policy.canWithdraw) && me !== null && author === me;
  return { accept: granted.accept, reject: granted.reject || own };
}

/**
 * Accepts or rejects suggestions as a policy allows, every one or those with the given ids; those
 * the reader may not decide stay. Fails when none may be decided.
 */
export function decideWithPolicy(
  policy: SuggestionPolicy,
  decision: SuggestionDecision,
  ids: ReadonlySet<string> | null = null,
): Command {
  return (state, dispatch) => {
    const allowed = listSuggestions(state.doc).filter(
      (each) => (ids === null || ids.has(each.id)) && suggestionPermissions(each, policy)[decision],
    );
    if (!allowed.length) return false;
    const tr = state.tr.setMeta(suggestionsKey, 'decide');
    const chosen = new Set(allowed.map((each) => each.id));
    if (!decideSuggestions(tr, decision, { ids: chosen, threadAuthor: policy.threadAuthor }))
      return false;
    dispatch?.(tr.scrollIntoView());
    return true;
  };
}
