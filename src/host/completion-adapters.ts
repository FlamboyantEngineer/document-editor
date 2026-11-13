// The adapter for inline completion: the host's provider, such as a language model, answers the
// text that may follow the caret, and names the agent a completion the writer takes is
// attributed to.

import type { HostResult } from './adapters.js';

/** What a completion provider is asked: the text around the caret and the block it is in. */
export interface CompletionContext {
  /** The text before the caret, across the blocks before it, up to the context length. */
  before: string;
  /** The rest of the caret's block after it. */
  after: string;
  /** The element id of the caret's block, or null when it has none. */
  elementId: string | null;
  /** The caret's block type, such as `paragraph` or `heading`. */
  blockType: string;
}

/** A provider's answer: the text that may follow, and the automated session that wrote it. */
export interface CompletionAnswer {
  /** The text; empty for none. */
  text: string;
  /** Recorded on the text when the writer takes it (`dataAiSession`). */
  session?: string | undefined;
}

/** Whether completion can be asked now, or why not. */
export type CompletionAvailability = { available: true } | { available: false; reason: string };

/** Completes the text a writer is typing, such as through a language model. */
export interface CompletionAdapter {
  /** The agent a taken completion is attributed to (its contributor id). */
  readonly agent: string;
  complete(
    request: CompletionContext & { signal?: AbortSignal | undefined },
  ): Promise<HostResult<CompletionAnswer>>;
  /** Whether completion can be asked now; always available when not given. */
  availability?(): CompletionAvailability;
  /** Calls back whenever availability changes; gives the unsubscribe. */
  subscribe?(listener: () => void): () => void;
}
