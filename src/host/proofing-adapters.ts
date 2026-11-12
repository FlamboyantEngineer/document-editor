// The host's text proofer, such as a spelling and grammar checker, and what it finds.

/** What a proofing issue is about. */
export type ProofingKind = 'spelling' | 'grammar' | 'style';

/** An issue a proofer found in a text, by the offsets of its characters there. */
export interface ProofingIssue {
  /** The offset of the issue's first character in the text checked. */
  readonly from: number;
  /** The offset just past its last character. */
  readonly to: number;
  readonly kind: ProofingKind;
  /** The issue in words, for the reader. */
  readonly message?: string | undefined;
  /** Text to put in place of the issue's, best first. */
  readonly suggestions: readonly string[];
  /** The proofer's rule that found it, which the reader may turn off. */
  readonly rule?: { readonly id: string; readonly description?: string | undefined } | undefined;
  /** The proofer's finer category, such as `punctuation` or `repeated-word`. */
  readonly category?: string | undefined;
}

/** A language a proofer checks, by its BCP 47 tag. */
export interface ProofingLanguage {
  readonly id: string;
  readonly label: string;
}

/** A text to check: a block's text, with each object in it, and code, as spaces. */
export interface ProofingText {
  readonly text: string;
  /** The language to check it in: the block's own, or the document's. */
  readonly language?: string | null | undefined;
}

/**
 * The host's text proofer, such as a spelling and grammar checker. `check` resolves to each text's
 * issues, in the order of the texts; a check that fails, or that the editor aborts because the
 * document changed, marks nothing.
 */
export interface ProoferAdapter {
  check(
    texts: readonly ProofingText[],
    options: { readonly signal: AbortSignal },
  ): Promise<readonly (readonly ProofingIssue[])[]>;
  /** Adds a word to the reader's dictionary, when the proofer keeps one. */
  addWord?: ((word: string) => Promise<void> | void) | undefined;
  /** Turns a rule off for the reader, when the proofer keeps their choice. */
  ignoreRule?: ((ruleId: string) => Promise<void> | void) | undefined;
  /** The languages it checks, which the reader may pick from. */
  languages?: readonly ProofingLanguage[] | undefined;
}
