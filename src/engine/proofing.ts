// Proofing: the host's text proofers check the document's text, and the editor marks what they
// report. A plugin hands them the text of each block not checked yet, a short while after the
// writer stops typing (`proofing-view.ts`), and keeps answers by text and language, so a block the pages
// move, or that the writer types back to an earlier text, is never checked twice. Issues are marked
// by decorations carrying `data-proofing-issue`, with the issue's category and rule; the reader
// may ignore an issue once, ignore its word, turn its rule off, or pick the language the text is
// checked in. Issues on technical tokens are not marked, and an editor the reader cannot edit, or
// that the host turns proofing off in, is not proofed.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type EditorState, Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import { DecorationSet } from 'prosemirror-view';
import type { ProoferAdapter, ProofingIssue, ProofingKind } from '../host/proofing-adapters.js';
import { viewOnlyInline } from '../utils/view-only-decorations.js';
import { issueFromDecoration, mapProofingIssueKey, proofingIssueKey } from './proofing-ranges.js';
import { proofedBlocks, proofingLanguage, proofingTextKey } from './proofing-text.js';
import { isTechnicalToken } from './proofing-tokens.js';
import { proofingView } from './proofing-view.js';
import { isRemoteTransaction } from './transaction-kind.js';

/** How a document is proofed. */
export interface ProofingOptions {
  /** The proofer, or several, such as a spelling checker and an abbreviation checker. */
  readonly proofer: ProoferAdapter | readonly ProoferAdapter[];
  /** The document's language, by its BCP 47 tag; a block's own language wins. */
  readonly language?: string | null | undefined;
  /** Milliseconds after the last change before the new text is checked. Defaults to 500. */
  readonly delay?: number | undefined;
  /** At most this many texts in one check. Defaults to 50. */
  readonly batch?: number | undefined;
  /** At most this many characters in one check. Defaults to 6000. */
  readonly batchLength?: number | undefined;
  /** A longer block is checked in segments of at most this many characters. Defaults to 2000. */
  readonly textLength?: number | undefined;
  /**
   * Whether a change came from elsewhere, such as a collaborator: it never aborts a running check,
   * so a busy room does not keep the writer's text unchecked. Defaults to `isRemoteTransaction`.
   */
  readonly isRemote?: ((tr: Transaction) => boolean) | undefined;
  /**
   * Whether an issue's text is left unmarked. Defaults to `isTechnicalToken`, so acronyms, part
   * numbers, standards and identifiers are not marked; null marks every issue.
   */
  readonly skip?: ((text: string) => boolean) | null | undefined;
  /** The words the reader ignores everywhere in the document, as kept from before. */
  readonly ignored?: Iterable<string> | undefined;
  /** The rules the reader turned off, as kept from before. */
  readonly disabledRules?: Iterable<string> | undefined;
  /** Told each word the reader ignores everywhere and each rule they turn off, to keep them. */
  readonly onDecision?: ((decision: ProofingDecision) => void) | undefined;
  /**
   * Whether the document is proofed in a state, beside the editor being editable: while it is not,
   * no check runs, a running one is aborted and nothing is marked. Defaults to always.
   */
  readonly isEnabled?: ((state: EditorState) => boolean) | undefined;
  /**
   * Starts the first check of the whole document when the host is ready for it, returning a
   * function that cancels it; by default the first check waits `delay`.
   */
  readonly scheduleFirstCheck?: ((run: () => void) => () => void) | undefined;
}

/** A choice of the reader's a host may keep: a word ignored everywhere, or a rule turned off. */
export type ProofingDecision =
  | { readonly kind: 'ignore'; readonly word: string }
  | { readonly kind: 'disable-rule'; readonly rule: string };

/** An issue a proofer found, with the proofer that found it. */
export interface SourcedIssue extends ProofingIssue {
  /** The index of the proofer that found it. */
  readonly source: number;
}

/** An issue in the document, by its positions there. */
export interface ProofingIssueAt {
  readonly from: number;
  readonly to: number;
  readonly kind: ProofingKind;
  readonly message: string | undefined;
  readonly suggestions: readonly string[];
  readonly rule: ProofingIssue['rule'];
  readonly category: string | undefined;
  /** The index of the proofer that found it. */
  readonly source: number;
  /** The issue's text in the document. */
  readonly text: string;
  /** Names this one issue in its block, to ignore it alone. */
  readonly key: string;
}

/** Whether the proofers answered the latest checks: all, some, or none of them. */
export type ProofingStatus = 'ready' | 'degraded' | 'unavailable';

/** What the proofing plugin keeps. */
export interface ProofingState {
  readonly proofers: readonly ProoferAdapter[];
  /** The document's language. */
  readonly language: string | null;
  /** Each checked text's issues, by text and effective language. */
  readonly results: ReadonlyMap<string, readonly SourcedIssue[]>;
  /** The check generation, advanced by an explicit recheck or a language change. */
  readonly generation: number;
  /** The words the reader ignores everywhere. */
  readonly ignored: ReadonlySet<string>;
  /** The single issues the reader ignores (`ProofingIssueAt.key`). */
  readonly ignoredOnce: ReadonlySet<string>;
  /** The rules the reader turned off. */
  readonly disabledRules: ReadonlySet<string>;
  readonly status: ProofingStatus;
  /**
   * Why a proofer did not answer the latest check, as it said (its error's `reason`, such as
   * `timeout` or `not-configured`), or null.
   */
  readonly reason: string | null;
  readonly decorations: DecorationSet;
  /** Whether the latest change to the document came from elsewhere (`isRemote`). */
  readonly remoteChange: boolean;
  /** The issue just revealed (`ProofingIssueAt.key`), marked `data-proofing-flash` for a moment. */
  readonly flash: string | null;
  /** Whether the document is proofed now (`ProofingOptions.isEnabled`, and the view editable). */
  readonly enabled: boolean;
  /**
   * The issue the reader last moved to, by its key and where it starts: the next one is found
   * after it, or after where it was once it is gone.
   */
  readonly visited: ProofingVisit | null;
  /** Whether an issue's text is left unmarked (`ProofingOptions.skip`). */
  readonly skip: ((text: string) => boolean) | null;
  /** Told the reader's choices to keep (`ProofingOptions.onDecision`). */
  readonly onDecision: ((decision: ProofingDecision) => void) | null;
}

export type ProofingMeta =
  | {
      readonly results: ReadonlyMap<string, readonly SourcedIssue[]>;
      readonly status: ProofingStatus;
      readonly reason?: string | null | undefined;
      readonly generation?: number | undefined;
    }
  | { readonly ignore: string }
  | { readonly ignoreOnce: string }
  | { readonly disableRule: string }
  | { readonly language: string | null }
  | { readonly recheck: true }
  | { readonly flash: string | null }
  | { readonly enabled: boolean }
  | { readonly visited: ProofingVisit | null };

/** An issue the reader moved to (`selectNextProofingIssue`). */
interface ProofingVisit {
  readonly key: string;
  readonly from: number;
}

/** The proofing plugin's state; marks the transactions that change it. */
export const proofingKey = new PluginKey<ProofingState>('proofing');

/** The hook a proofing issue's decoration carries, with the issue's kind. */
export const PROOFING_ISSUE_ATTR = 'data-proofing-issue';

/** The hook the issue just revealed carries, for a stylesheet to flash it. */
const PROOFING_FLASH_ATTR = 'data-proofing-flash';

/** The hooks an issue's decoration carries: its finer category, or its kind, and its rule. */
const PROOFING_CATEGORY_ATTR = 'data-proofing-category';
const PROOFING_RULE_ATTR = 'data-proofing-rule';

// Whether the reader ignores an issue: its text everywhere, it alone, or its rule; or it is on a
// technical token (`skip`).
function isIgnored(
  value: ProofingState,
  { issue, text, key }: { issue: SourcedIssue; text: string; key: string },
): boolean {
  if (value.ignored.has(text) || value.ignoredOnce.has(key)) return true;
  if (issue.kind === 'spelling' && value.skip?.(text)) return true;
  return Boolean(issue.rule && value.disabledRules.has(issue.rule.id));
}

function issuesOf(doc: ProseMirrorNode, value: ProofingState) {
  const issues: { issue: ProofingIssueAt; language: string | null }[] = [];
  for (const block of proofedBlocks(doc, value.language)) {
    for (const issue of value.results.get(proofingTextKey(block)) ?? []) {
      const first = block.offsets[issue.from];
      const last = block.offsets[issue.to - 1];
      if (first === undefined || last === undefined || issue.to <= issue.from) continue;
      // An issue wholly in an inline atom's text, which the writer cannot edit there.
      if (first === last && issue.to - issue.from > 1) continue;
      const text = block.text.slice(issue.from, issue.to);
      const located = {
        ...issue,
        from: block.start + first,
        to: block.start + last + 1,
        message: issue.message,
        rule: issue.rule,
        category: issue.category,
        text,
      };
      const key = proofingIssueKey(located);
      if (isIgnored(value, { issue, text, key })) continue;
      issues.push({ issue: { ...located, key }, language: block.language });
    }
  }
  return issues;
}

function decorate(doc: ProseMirrorNode, value: ProofingState): ProofingState {
  const decorations = DecorationSet.create(
    doc,
    issuesOf(doc, value).map(({ issue, language }) =>
      viewOnlyInline(
        issue,
        {
          [PROOFING_ISSUE_ATTR]: issue.kind,
          [PROOFING_CATEGORY_ATTR]: issue.category ?? issue.kind,
          ...(issue.rule ? { [PROOFING_RULE_ATTR]: issue.rule.id } : {}),
          ...(issue.key === value.flash ? { [PROOFING_FLASH_ATTR]: 'true' } : {}),
        },
        { issue, language },
      ),
    ),
  );
  return { ...value, decorations };
}

// The results kept for the texts the document holds, with new ones.
function keepResults(
  doc: ProseMirrorNode,
  value: ProofingState,
  added: ReadonlyMap<string, readonly SourcedIssue[]>,
): Map<string, readonly SourcedIssue[]> {
  const kept = new Map<string, readonly SourcedIssue[]>();
  for (const block of proofedBlocks(doc, value.language)) {
    const key = proofingTextKey(block);
    const issues = added.get(key) ?? value.results.get(key);
    if (issues) kept.set(key, issues);
  }
  return kept;
}

const adding = <T>(set: ReadonlySet<T>, value: T) => new Set([...set, value]);

function applyMeta(meta: ProofingMeta, value: ProofingState, doc: ProseMirrorNode): ProofingState {
  if ('results' in meta) {
    if (meta.generation !== undefined && meta.generation !== value.generation) return value;
    const results = keepResults(doc, value, meta.results);
    return decorate(doc, { ...value, results, status: meta.status, reason: meta.reason ?? null });
  }
  if ('ignore' in meta) {
    return decorate(doc, { ...value, ignored: adding(value.ignored, meta.ignore) });
  }
  if ('ignoreOnce' in meta) {
    const { decorations } = value;
    const ignored = decorations
      .find()
      .filter((each) => issueFromDecoration(each).key === meta.ignoreOnce);
    return {
      ...value,
      ignoredOnce: adding(value.ignoredOnce, meta.ignoreOnce),
      decorations: decorations.remove(ignored),
    };
  }
  if ('flash' in meta) return decorate(doc, { ...value, flash: meta.flash });
  if ('enabled' in meta) return { ...value, enabled: meta.enabled };
  if ('visited' in meta) return { ...value, visited: meta.visited };
  if ('disableRule' in meta) {
    return decorate(doc, {
      ...value,
      disabledRules: adding(value.disabledRules, meta.disableRule),
    });
  }
  // A new language, or a new check, starts every text over.
  const language = 'language' in meta ? meta.language : value.language;
  return {
    ...value,
    language,
    generation: value.generation + 1,
    results: new Map(),
    decorations: DecorationSet.empty,
    status: 'ready',
    reason: null,
  };
}

// The issues' marks moved through a change, without those whose text it changed, which wait for
// the next check. Comparing each mark's text keeps this as cheap for a change of many steps, such as
// a new layout of the pages, as for a key press.
function mapDecorations({ decorations, language }: ProofingState, tr: Transaction): DecorationSet {
  if (decorations === DecorationSet.empty) return decorations;
  const mapped = decorations.map(tr.mapping, tr.doc);
  const changed = mapped.find().filter(({ from, to, spec }) => {
    const marked = spec as { issue: ProofingIssueAt; language: string | null };
    return (
      tr.doc.textBetween(from, to) !== marked.issue.text ||
      proofingLanguage(tr.doc.resolve(from).parent, language) !== marked.language
    );
  });
  return changed.length > 0 ? mapped.remove(changed) : mapped;
}

function mapProofingState(value: ProofingState, tr: Transaction, remoteChange: boolean) {
  const { visited, ignoredOnce } = value;
  const remap = (key: string) => mapProofingIssueKey(key, tr.mapping);
  return {
    ...value,
    decorations: mapDecorations(value, tr),
    remoteChange,
    visited: visited && { key: remap(visited.key) ?? '', from: tr.mapping.map(visited.from) },
    ignoredOnce: ignoredOnce.size
      ? new Set([...ignoredOnce].map(remap).filter((key) => key !== null))
      : ignoredOnce,
  };
}

/** The texts of a state's document not checked yet, each once. */
export function uncheckedBlocks(state: EditorState) {
  const proofing = proofingKey.getState(state);
  if (!proofing) return [];
  const seen = new Set<string>();
  return proofedBlocks(state.doc, proofing.language).filter((block) => {
    const key = proofingTextKey(block);
    if (proofing.results.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const pendingDocs = new WeakMap<
  ProseMirrorNode,
  WeakMap<ReadonlyMap<string, readonly SourcedIssue[]>, boolean>
>();

/** Whether some of the document's text is still to be checked; false when it is not proofed. */
export function isProofingPending(state: EditorState): boolean {
  const proofing = proofingKey.getState(state);
  if (!proofing?.enabled) return false;
  const { results } = proofing;
  const known = pendingDocs.get(state.doc)?.get(results);
  if (known !== undefined) return known;
  const pending = uncheckedBlocks(state).length > 0;
  const byResults = pendingDocs.get(state.doc) ?? new WeakMap();
  byResults.set(results, pending);
  pendingDocs.set(state.doc, byResults);
  return pending;
}

/**
 * For a transaction that only changes the proofing state, the update that commits it on the
 * latest state; null for any other. The plugin dispatches these when a check comes back, and a
 * host that commits through React state, whose view may still show an older state, commits them
 * this way so the results never land on a state the writer has typed past.
 */
export function proofingUpdate(tr: Transaction): ((state: EditorState) => EditorState) | null {
  const meta = tr.getMeta(proofingKey) as ProofingMeta | undefined;
  if (!meta || tr.steps.length > 0 || tr.selectionSet) return null;
  return (state) => state.apply(state.tr.setMeta(proofingKey, meta).setMeta('addToHistory', false));
}

/** The plugin that proofs a document with the host's proofers and marks the issues they find. */
export function createProofing(options: ProofingOptions): Plugin<ProofingState> {
  const proofers: readonly ProoferAdapter[] = Array.isArray(options.proofer)
    ? options.proofer
    : [options.proofer as ProoferAdapter];
  return new Plugin<ProofingState>({
    key: proofingKey,
    state: {
      init: () => ({
        proofers,
        language: options.language ?? null,
        generation: 0,
        results: new Map(),
        ignoredOnce: new Set(),
        status: 'ready',
        reason: null,
        decorations: DecorationSet.empty,
        remoteChange: false,
        flash: null,
        enabled: true,
        visited: null,
        ignored: new Set(options.ignored ?? []),
        disabledRules: new Set(options.disabledRules ?? []),
        skip: options.skip === undefined ? isTechnicalToken : options.skip,
        onDecision: options.onDecision ?? null,
      }),
      apply(tr: Transaction, value) {
        const meta = tr.getMeta(proofingKey) as ProofingMeta | undefined;
        if (meta) return applyMeta(meta, value, tr.doc);
        if (!tr.docChanged) return value;
        return mapProofingState(value, tr, (options.isRemote ?? isRemoteTransaction)(tr));
      },
    },
    props: {
      decorations: (state) => {
        const proofing = proofingKey.getState(state);
        return proofing?.enabled ? proofing.decorations : null;
      },
    },
    view: (view) => proofingView(view, options),
  });
}
