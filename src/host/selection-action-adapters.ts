// The adapter for actions on the selected text: the host's provider, such as a language model,
// is asked to act on the passages the writer selected, such as to shorten them, fix their grammar
// or review them, and answers the replacements and the comments it makes, which the editor
// records as the agent's suggestions and comment threads.

import type { HostResult } from './adapters.js';

/** A selected passage: a range of one element's text, by element id and offsets in its text. */
export interface SelectionPassage {
  readonly elementId: string;
  /** Where the passage starts in the element's text, each inline object counting one. */
  readonly from: number;
  /** Where it ends. */
  readonly to: number;
  /** The passage's text, each inline object as a space. */
  readonly text: string;
  /** The element's block type, such as `paragraph` or `heading`. */
  readonly blockType: string;
}

/** What a provider is asked: the action, the host's own words for it, and the passages. */
export interface SelectionActionRequest {
  /** The host's name for the action, such as `shorten` or `review`. */
  readonly action: string;
  /** What the writer asked for in their own words, when they did. */
  readonly instruction?: string | undefined;
  /** The selected passages, in document order. */
  readonly passages: readonly SelectionPassage[];
  readonly signal?: AbortSignal | undefined;
}

/** A replacement or a comment the provider makes, on a range of a passage's element text. */
export interface SelectionActionChange {
  readonly elementId: string;
  /** Offsets in the element's text, within one of the passages. */
  readonly from: number;
  readonly to: number;
  /** The replacement text, or the comment's text. */
  readonly text: string;
}

/** A provider's answer: what it replaces, what it comments, and the session that answered. */
export interface SelectionActionAnswer {
  readonly replacements?: readonly SelectionActionChange[] | undefined;
  readonly comments?: readonly SelectionActionChange[] | undefined;
  /** Recorded with what the agent writes (`dataAiSession`). */
  readonly session?: string | undefined;
}

/** Acts on the selected text, such as through a language model. */
export interface SelectionActionsAdapter {
  /** The agent its suggestions and comments are attributed to (its contributor id). */
  readonly agent: string;
  run(request: SelectionActionRequest): Promise<HostResult<SelectionActionAnswer>>;
}
