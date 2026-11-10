// Proofing: the host's text proofers check the document's text, and the editor marks what they
// report. A plugin hands them the text of each block not checked yet, a short while after the
// writer stops typing (`proofing-view.ts`), and keeps what comes back by text, so a block the pages
// move, or that the writer types back to an earlier text, is never checked twice. Issues are marked
// by decorations carrying `data-proofing-issue`; the reader may ignore an issue once, ignore its
// word, turn its rule off, or pick the language the text is checked in.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type EditorState, Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { ProoferAdapter, ProofingIssue, ProofingKind } from '../host/adapters.js';
import { isRemoteTransaction } from './presence.js';
import { proofedBlocks } from './proofing-text.js';
import { proofingView } from './proofing-view.js';

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
}

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
  /** Each checked text's issues, by text. */
  readonly results: ReadonlyMap<string, readonly SourcedIssue[]>;
  /** The words the reader ignores everywhere. */
  readonly ignored: ReadonlySet<string>;
  /** The single issues the reader ignores (`ProofingIssueAt.key`). */
  readonly ignoredOnce: ReadonlySet<string>;
  /** The rules the reader turned off. */
  readonly disabledRules: ReadonlySet<string>;
  readonly status: ProofingStatus;
  readonly decorations: DecorationSet;
  /** Whether the latest change to the document came from elsewhere (`isRemote`). */
  readonly remoteChange: boolean;
}

export type ProofingMeta =
  | {
      readonly results: ReadonlyMap<string, readonly SourcedIssue[]>;
      readonly status: ProofingStatus;
    }
  | { readonly ignore: string }
  | { readonly ignoreOnce: string }
  | { readonly disableRule: string }
  | { readonly language: string | null }
  | { readonly recheck: true };

/** The proofing plugin's state; marks the transactions that change it. */
export const proofingKey = new PluginKey<ProofingState>('proofing');

/** The hook a proofing issue's decoration carries, with the issue's kind. */
export const PROOFING_ISSUE_ATTR = 'data-proofing-issue';

type KeyedIssue = Pick<ProofingIssue, 'from' | 'to' | 'rule' | 'kind'>;

const issueKey = (blockText: string, issue: KeyedIssue) =>
  `${blockText}\u0000${String(issue.from)}:${String(issue.to)}:${issue.rule?.id ?? issue.kind}`;

/**
 * The key of an issue in a state's document as it is now: its block's text and its offsets there,
 * which may differ from the key it was marked with while its block waits to be checked again.
 */
export function currentIssueKey(state: EditorState, issue: ProofingIssueAt): string {
  for (const block of proofedBlocks(state.doc)) {
    const from = block.offsets.indexOf(issue.from - block.start);
    const last = block.offsets.indexOf(issue.to - 1 - block.start);
    if (from >= 0 && last >= from) {
      return issueKey(block.text, { ...issue, from, to: last + 1 });
    }
  }
  return issue.key;
}

function issuesOf(doc: ProseMirrorNode, value: ProofingState): ProofingIssueAt[] {
  const issues: ProofingIssueAt[] = [];
  for (const block of proofedBlocks(doc)) {
    for (const issue of value.results.get(block.text) ?? []) {
      const first = block.offsets[issue.from];
      const last = block.offsets[issue.to - 1];
      if (first === undefined || last === undefined || issue.to <= issue.from) continue;
      const text = block.text.slice(issue.from, issue.to);
      const key = issueKey(block.text, issue);
      if (value.ignored.has(text) || value.ignoredOnce.has(key)) continue;
      if (issue.rule && value.disabledRules.has(issue.rule.id)) continue;
      issues.push({
        from: block.start + first,
        to: block.start + last + 1,
        kind: issue.kind,
        message: issue.message,
        suggestions: issue.suggestions,
        rule: issue.rule,
        category: issue.category,
        source: issue.source,
        text,
        key,
      });
    }
  }
  return issues;
}

function decorate(doc: ProseMirrorNode, value: ProofingState): ProofingState {
  const decorations = DecorationSet.create(
    doc,
    issuesOf(doc, value).map((issue) =>
      Decoration.inline(issue.from, issue.to, { [PROOFING_ISSUE_ATTR]: issue.kind }, { issue }),
    ),
  );
  return { ...value, decorations };
}

// The results kept for the texts the document holds, with new ones.
function keepResults(
  doc: ProseMirrorNode,
  results: ReadonlyMap<string, readonly SourcedIssue[]>,
  added: ReadonlyMap<string, readonly SourcedIssue[]>,
): Map<string, readonly SourcedIssue[]> {
  const kept = new Map<string, readonly SourcedIssue[]>();
  for (const block of proofedBlocks(doc)) {
    const issues = added.get(block.text) ?? results.get(block.text);
    if (issues) kept.set(block.text, issues);
  }
  return kept;
}

const adding = <T>(set: ReadonlySet<T>, value: T) => new Set([...set, value]);

function applyMeta(meta: ProofingMeta, value: ProofingState, doc: ProseMirrorNode): ProofingState {
  if ('results' in meta) {
    const results = keepResults(doc, value.results, meta.results);
    return decorate(doc, { ...value, results, status: meta.status });
  }
  if ('ignore' in meta) {
    return decorate(doc, { ...value, ignored: adding(value.ignored, meta.ignore) });
  }
  if ('ignoreOnce' in meta) {
    return decorate(doc, { ...value, ignoredOnce: adding(value.ignoredOnce, meta.ignoreOnce) });
  }
  if ('disableRule' in meta) {
    return decorate(doc, {
      ...value,
      disabledRules: adding(value.disabledRules, meta.disableRule),
    });
  }
  // A new language, or a new check, starts every text over.
  const language = 'language' in meta ? meta.language : value.language;
  return decorate(doc, { ...value, language, results: new Map(), status: 'ready' });
}

// The issues' marks moved through a change, without those whose text it changed, which wait for
// the next check. Comparing each mark's text keeps this as cheap for a change of many steps, such as
// a new layout of the pages, as for a key press.
function mapDecorations(decorations: DecorationSet, tr: Transaction): DecorationSet {
  if (decorations === DecorationSet.empty) return decorations;
  const mapped = decorations.map(tr.mapping, tr.doc);
  const changed = mapped
    .find()
    .filter(
      (decoration) =>
        tr.doc.textBetween(decoration.from, decoration.to) !==
        (decoration.spec as { issue: ProofingIssueAt }).issue.text,
    );
  return changed.length > 0 ? mapped.remove(changed) : mapped;
}

/** The texts of a state's document not checked yet, each once. */
export function uncheckedBlocks(state: EditorState) {
  const proofing = proofingKey.getState(state);
  if (!proofing) return [];
  const seen = new Set<string>();
  return proofedBlocks(state.doc).filter((block) => {
    if (proofing.results.has(block.text) || seen.has(block.text)) return false;
    seen.add(block.text);
    return true;
  });
}

const pendingDocs = new WeakMap<
  ProseMirrorNode,
  WeakMap<ReadonlyMap<string, readonly SourcedIssue[]>, boolean>
>();

/** Whether some of the document's text is still to be checked; false when it is not proofed. */
export function isProofingPending(state: EditorState): boolean {
  const results = proofingKey.getState(state)?.results;
  if (!results) return false;
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
        results: new Map(),
        ignored: new Set(),
        ignoredOnce: new Set(),
        disabledRules: new Set(),
        status: 'ready',
        decorations: DecorationSet.empty,
        remoteChange: false,
      }),
      apply(tr: Transaction, value) {
        const meta = tr.getMeta(proofingKey) as ProofingMeta | undefined;
        if (meta) return applyMeta(meta, value, tr.doc);
        if (!tr.docChanged) return value;
        return {
          ...value,
          decorations: mapDecorations(value.decorations, tr),
          remoteChange: (options.isRemote ?? isRemoteTransaction)(tr),
        };
      },
    },
    props: {
      decorations: (state) => proofingKey.getState(state)?.decorations ?? null,
    },
    view: (view) => proofingView(view, options),
  });
}
