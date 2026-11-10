// Proofing: the host's text proofer checks the document's text, and the editor marks what it
// reports. A plugin hands the proofer the text of each block it has not checked yet, a short while
// after the writer stops typing, and keeps what comes back by text, so a block the pages move, or
// that the writer types back to an earlier text, is never checked twice. Issues are marked by
// decorations carrying `data-proofing-issue`, and commands replace an issue's text with a
// suggestion, ignore its word, or move to the next issue.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import {
  type EditorState,
  Plugin,
  PluginKey,
  type PluginView,
  type Transaction,
} from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import type { ProoferAdapter, ProofingIssue, ProofingKind } from '../host/adapters.js';

/** How a document is proofed. */
export interface ProofingOptions {
  readonly proofer: ProoferAdapter;
  /** Milliseconds after the last change before the new text is checked. Defaults to 500. */
  readonly delay?: number | undefined;
  /** At most this many texts in one check. Defaults to 50. */
  readonly batch?: number | undefined;
}

/** An issue in the document, by its positions there. */
export interface ProofingIssueAt {
  readonly from: number;
  readonly to: number;
  readonly kind: ProofingKind;
  readonly message: string | undefined;
  readonly suggestions: readonly string[];
  /** The issue's text in the document. */
  readonly text: string;
}

/** What the proofing plugin keeps. */
export interface ProofingState {
  readonly proofer: ProoferAdapter;
  /** Each checked text's issues, by text. */
  readonly results: ReadonlyMap<string, readonly ProofingIssue[]>;
  /** The words the reader chose to ignore everywhere. */
  readonly ignored: ReadonlySet<string>;
  readonly decorations: DecorationSet;
}

type ProofingMeta =
  { readonly results: ReadonlyMap<string, readonly ProofingIssue[]> } | { readonly ignore: string };

/** The proofing plugin's state; marks the transactions that bring results or ignore a word. */
export const proofingKey = new PluginKey<ProofingState>('proofing');

/** The hook a proofing issue's decoration carries, with the issue's kind. */
export const PROOFING_ISSUE_ATTR = 'data-proofing-issue';

// Page headers and footers, which the template fills, and blocks whose text is code.
const UNPROOFED_BLOCKS = new Set([
  'page_header',
  'page_footer',
  'code_block',
  'linked_code_block',
  'math_display',
]);
// Text in these marks is left out: code, and text a suggestion deletes.
const UNPROOFED_MARKS = new Set(['code', 'deletion']);

/** A block's text and the document position of each of its characters. */
interface ProofedBlock {
  readonly text: string;
  readonly language: string | null;
  readonly positions: readonly number[];
}

function blockText(block: ProseMirrorNode, start: number): ProofedBlock {
  let text = '';
  const positions: number[] = [];
  block.forEach((child, offset) => {
    const pos = start + offset;
    const skipped = child.marks.some((mark) => UNPROOFED_MARKS.has(mark.type.name));
    if (child.isText && child.text) {
      text += skipped ? ' '.repeat(child.text.length) : child.text;
      for (let index = 0; index < child.text.length; index += 1) positions.push(pos + index);
    } else {
      text += ' ';
      positions.push(pos);
    }
  });
  const language = typeof block.attrs.lang === 'string' ? block.attrs.lang : null;
  return { text, language, positions };
}

// Each prose block of the document, in order: the pages' bodies and footnote areas, without their
// headers and footers.
function proofedBlocks(doc: ProseMirrorNode): ProofedBlock[] {
  const blocks: ProofedBlock[] = [];
  doc.descendants((node, pos) => {
    if (UNPROOFED_BLOCKS.has(node.type.name)) return false;
    if (!node.isTextblock) return true;
    const block = blockText(node, pos + 1);
    if (block.text.trim()) blocks.push(block);
    return false;
  });
  return blocks;
}

function issuesOf(
  doc: ProseMirrorNode,
  results: ReadonlyMap<string, readonly ProofingIssue[]>,
  ignored: ReadonlySet<string>,
): ProofingIssueAt[] {
  const issues: ProofingIssueAt[] = [];
  for (const block of proofedBlocks(doc)) {
    for (const issue of results.get(block.text) ?? []) {
      const first = block.positions[issue.from];
      const last = block.positions[issue.to - 1];
      if (first === undefined || last === undefined || issue.to <= issue.from) continue;
      const text = block.text.slice(issue.from, issue.to);
      if (ignored.has(text)) continue;
      issues.push({
        from: first,
        to: last + 1,
        kind: issue.kind,
        message: issue.message,
        suggestions: issue.suggestions,
        text,
      });
    }
  }
  return issues;
}

function decorate(doc: ProseMirrorNode, issues: readonly ProofingIssueAt[]): DecorationSet {
  return DecorationSet.create(
    doc,
    issues.map((issue) =>
      Decoration.inline(issue.from, issue.to, { [PROOFING_ISSUE_ATTR]: issue.kind }, { issue }),
    ),
  );
}

// The texts of the document not checked yet.
function uncheckedTexts(state: EditorState): ProofedBlock[] {
  const proofing = proofingKey.getState(state);
  if (!proofing) return [];
  const seen = new Set<string>();
  return proofedBlocks(state.doc).filter((block) => {
    if (proofing.results.has(block.text) || seen.has(block.text)) return false;
    seen.add(block.text);
    return true;
  });
}

// The results kept for the texts the document holds, with new ones.
function keepResults(
  doc: ProseMirrorNode,
  results: ReadonlyMap<string, readonly ProofingIssue[]>,
  added: ReadonlyMap<string, readonly ProofingIssue[]>,
): Map<string, readonly ProofingIssue[]> {
  const kept = new Map<string, readonly ProofingIssue[]>();
  for (const block of proofedBlocks(doc)) {
    const issues = added.get(block.text) ?? results.get(block.text);
    if (issues) kept.set(block.text, issues);
  }
  return kept;
}

function applyMeta(meta: ProofingMeta, value: ProofingState, doc: ProseMirrorNode): ProofingState {
  const results = 'results' in meta ? keepResults(doc, value.results, meta.results) : value.results;
  const ignored = 'ignore' in meta ? new Set([...value.ignored, meta.ignore]) : value.ignored;
  return {
    ...value,
    results,
    ignored,
    decorations: decorate(doc, issuesOf(doc, results, ignored)),
  };
}

// Checks the document's unchecked text a short while after it changes, one check at a time; a
// check the document outran is aborted, and the next one starts from the new text.
function proofingView(view: EditorView, options: ProofingOptions): PluginView {
  const owner = view.dom.ownerDocument.defaultView;
  let timer: number | null = null;
  let running: AbortController | null = null;

  function clear() {
    if (timer !== null) owner?.clearTimeout(timer);
    timer = null;
  }

  function schedule(delay: number) {
    clear();
    timer =
      owner?.setTimeout(() => {
        timer = null;
        void run();
      }, delay) ?? null;
  }

  async function check(texts: readonly ProofedBlock[], controller: AbortController) {
    const found = await options.proofer.check(
      texts.map(({ text, language }) => ({ text, language })),
      { signal: controller.signal },
    );
    if (controller.signal.aborted || view.isDestroyed) return false;
    const results = new Map(texts.map((block, index) => [block.text, found[index] ?? []]));
    view.dispatch(view.state.tr.setMeta(proofingKey, { results }).setMeta('addToHistory', false));
    return true;
  }

  async function run() {
    const texts = uncheckedTexts(view.state).slice(0, options.batch ?? 50);
    if (texts.length === 0) return;
    const controller = new AbortController();
    running = controller;
    // A check that fails marks nothing in its texts, and leaves them checked.
    const failed = () => {
      if (controller.signal.aborted || view.isDestroyed) return false;
      const results = new Map(texts.map((block) => [block.text, []]));
      view.dispatch(view.state.tr.setMeta(proofingKey, { results }).setMeta('addToHistory', false));
      return true;
    };
    const done = await check(texts, controller).catch(failed);
    if (running === controller) running = null;
    // More text than one check takes is checked next.
    if (done && !view.isDestroyed) schedule(0);
  }

  // The first check waits as long as one after a change, so it does not slow the editor's start.
  schedule(options.delay ?? 500);
  return {
    update(next, previous) {
      if (next.state.doc.eq(previous.doc)) return;
      running?.abort();
      schedule(options.delay ?? 500);
    },
    destroy() {
      clear();
      running?.abort();
    },
  };
}

// The issues' marks moved through a change, without those on text it changed, which wait for the
// next check.
function mapDecorations(decorations: DecorationSet, tr: Transaction): DecorationSet {
  let mapped = decorations.map(tr.mapping, tr.doc);
  const changed: Decoration[] = [];
  tr.mapping.maps.forEach((map, index) => {
    const after = tr.mapping.slice(index + 1);
    // Each range the step changed: its old start and end, then its new start and end.
    map.forEach((...range: number[]) => {
      const [, , newStart = 0, newEnd = 0] = range;
      changed.push(...mapped.find(after.map(newStart, -1), after.map(newEnd, 1)));
    });
  });
  if (changed.length > 0) mapped = mapped.remove(changed);
  return mapped;
}

const pendingDocs = new WeakMap<
  ProseMirrorNode,
  WeakMap<ReadonlyMap<string, readonly ProofingIssue[]>, boolean>
>();

/** Whether some of the document's text is still to be checked; false when it is not proofed. */
export function isProofingPending(state: EditorState): boolean {
  const results = proofingKey.getState(state)?.results;
  if (!results) return false;
  const known = pendingDocs.get(state.doc)?.get(results);
  if (known !== undefined) return known;
  const pending = uncheckedTexts(state).length > 0;
  const byResults = pendingDocs.get(state.doc) ?? new WeakMap();
  byResults.set(results, pending);
  pendingDocs.set(state.doc, byResults);
  return pending;
}

/**
 * For a transaction that only brings proofing results, the update that commits it on the
 * latest state; null for any other. The plugin dispatches these when a check comes back, and a
 * host that commits through React state, whose view may still show an older state, commits them
 * this way so the results never land on a state the writer has typed past.
 */
export function proofingUpdate(tr: Transaction): ((state: EditorState) => EditorState) | null {
  const meta = tr.getMeta(proofingKey) as ProofingMeta | undefined;
  if (!meta || tr.steps.length > 0 || tr.selectionSet) return null;
  return (state) => state.apply(state.tr.setMeta(proofingKey, meta).setMeta('addToHistory', false));
}

/** The plugin that proofs a document with the host's proofer and marks the issues it finds. */
export function createProofing(options: ProofingOptions): Plugin<ProofingState> {
  return new Plugin<ProofingState>({
    key: proofingKey,
    state: {
      init: () => ({
        proofer: options.proofer,
        results: new Map(),
        ignored: new Set(),
        decorations: DecorationSet.empty,
      }),
      apply(tr: Transaction, value) {
        const meta = tr.getMeta(proofingKey) as ProofingMeta | undefined;
        if (meta) return applyMeta(meta, value, tr.doc);
        if (!tr.docChanged) return value;
        return { ...value, decorations: mapDecorations(value.decorations, tr) };
      },
    },
    props: {
      decorations: (state) => proofingKey.getState(state)?.decorations ?? null,
    },
    view: (view) => proofingView(view, options),
  });
}
