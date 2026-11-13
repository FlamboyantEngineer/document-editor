// The in-memory host's completion provider: answers with a function a lab or test gives, as the
// agent `memory-completion`, each answer its own session.

import type { CompletionAdapter, CompletionContext } from './completion-adapters.js';

/** The agent the in-memory host's completions are attributed to. */
export const MEMORY_COMPLETION_AGENT = 'memory-completion';

/** A completion provider that answers with `complete`; a throw is an `unavailable` failure. */
export function createMemoryCompletion(
  complete: (context: CompletionContext) => string,
): CompletionAdapter {
  let sessions = 0;
  return {
    agent: MEMORY_COMPLETION_AGENT,
    complete: ({ signal: _signal, ...context }) => {
      try {
        sessions += 1;
        const value = { text: complete(context), session: `completion-${String(sessions)}` };
        return Promise.resolve({ ok: true, value });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Promise.resolve({ ok: false, error: { kind: 'unavailable', message } });
      }
    },
  };
}
