// A proofer that knows only the misspellings it is given: each listed word found in a text is a
// spelling issue whose suggestions are the word's corrections, with the found word's capital kept.
// It stands in for a host's proofer in tests and labs. Added words are no longer flagged.

import type { ProoferAdapter, ProofingIssue, ProofingKind, ProofingLanguage } from './adapters.js';

/** The misspellings a word-list proofer flags. */
export interface WordListProoferOptions {
  /** Each misspelling, in lower case, and its corrections, best first. */
  readonly corrections: Readonly<Record<string, readonly string[]>>;
  /** Misspellings by language, in place of `corrections` for a text in that language. */
  readonly byLanguage?:
    Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> | undefined;
  /** The languages it offers the reader. */
  readonly languages?: readonly ProofingLanguage[] | undefined;
  /** What it calls its issues, such as `abbreviation`; spelling and grammar by default. */
  readonly kind?: ProofingKind | undefined;
  /** Phrases flagged as grammar issues, with a message and their corrections; each is a rule. */
  readonly grammar?:
    | Readonly<
        Record<string, { readonly message: string; readonly suggestions: readonly string[] }>
      >
    | undefined;
}

const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu;

const capitalized = (word: string, like: string) =>
  like[0] && like[0] !== like[0].toLowerCase()
    ? `${word.charAt(0).toUpperCase()}${word.slice(1)}`
    : word;

function spelling(
  text: string,
  corrections: Readonly<Record<string, readonly string[]>>,
  { added, kind }: { added: ReadonlySet<string>; kind: ProofingKind },
): ProofingIssue[] {
  const issues: ProofingIssue[] = [];
  for (const match of text.matchAll(WORD)) {
    const word = match[0].toLowerCase();
    const fixes = Object.hasOwn(corrections, word) ? corrections[word] : undefined;
    if (!fixes || added.has(word)) continue;
    issues.push({
      from: match.index,
      to: match.index + match[0].length,
      kind,
      suggestions: fixes.map((fix) => capitalized(fix, match[0])),
    });
  }
  return issues;
}

function grammar(
  text: string,
  rules: NonNullable<WordListProoferOptions['grammar']>,
  disabled: ReadonlySet<string>,
) {
  const issues: ProofingIssue[] = [];
  const lower = text.toLowerCase();
  for (const [phrase, rule] of Object.entries(rules)) {
    if (disabled.has(phrase)) continue;
    for (let at = lower.indexOf(phrase); at >= 0; at = lower.indexOf(phrase, at + 1)) {
      issues.push({
        from: at,
        to: at + phrase.length,
        kind: 'grammar',
        rule: { id: phrase, description: rule.message },
        ...rule,
      });
    }
  }
  return issues;
}

/** A proofer flagging the listed misspellings and phrases, for tests and labs. */
export function createWordListProofer(options: WordListProoferOptions): ProoferAdapter {
  const added = new Set<string>();
  const disabled = new Set<string>();
  const kind = options.kind ?? 'spelling';
  return {
    check: (texts) =>
      Promise.resolve(
        texts.map(({ text, language }) => {
          const corrections = (language && options.byLanguage?.[language]) || options.corrections;
          return [
            ...spelling(text, corrections, { added, kind }),
            ...grammar(text, options.grammar ?? {}, disabled),
          ].sort((left, right) => left.from - right.from);
        }),
      ),
    addWord: (word) => {
      added.add(word.toLowerCase());
    },
    ignoreRule: (rule) => {
      disabled.add(rule);
    },
    languages: options.languages,
  };
}
