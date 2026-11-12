// What comments may mention: people, groups, assistants or kinds of the host's own, and how a
// mention is written into a comment's text and read back.

/** Someone or something a comment can mention. */
export interface MentionTarget {
  /** What it is: a `person`, a `group`, an `assistant`, or a kind of the host's own. */
  kind: 'person' | 'group' | 'assistant' | (string & {});
  id: string;
  name: string;
  /** Image URL for its picture. */
  avatarUrl?: string | undefined;
  /** A second line, such as a role. */
  description?: string | undefined;
  /** How many people a group holds. */
  count?: number | undefined;
}

/** A run of a comment's text: plain text, or one mention with the raw text it was written as. */
export type MentionTextRun =
  | { kind: 'text'; text: string }
  | { kind: 'mention'; text: string; id: string; name: string; mentionKind?: string | undefined };

/** What comments may mention, and how mentions are written into a comment's text. */
export interface MentionsAdapter {
  /** The people, groups and assistants matching what the reader typed after `@`. */
  find(query: string, signal?: AbortSignal): Promise<readonly MentionTarget[]>;
  /**
   * Writes a target into the text. Defaults to `@[Name](id)` for a person and `@kind[Name](id)`
   * for another kind.
   */
  serialize?(target: MentionTarget): string;
  /** Splits stored text into text and mentions; the inverse of `serialize`. */
  parse?(text: string): readonly MentionTextRun[];
  /**
   * Whether a group, or another target that stands for people, includes a person, so a thread
   * that mentions it counts as theirs.
   */
  includes?(target: { kind: string; id: string }, personId: string): boolean;
}
