// The proofing commands: listing the issues the proofing plugin marks, correcting one or all like
// it with a suggestion, ignoring one or its word everywhere, adding its word to the proofer's
// dictionary, turning its rule off, picking the language, checking again, moving to the next and
// revealing it. Abbreviations whose glossary entry needs the writer count and are visited with the
// issues.

import { type Command, type EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { type AbbreviationIssue, listAbbreviationIssues } from './abbreviation-health.js';
import {
  currentIssueKey,
  PROOFING_ISSUE_ATTR,
  type ProofingIssueAt,
  proofingKey,
  type ProofingMeta,
  type ProofingState,
} from './proofing.js';

/** The proofing state, or null when the document is not proofed. */
export function proofingState(state: EditorState): ProofingState | null {
  return proofingKey.getState(state) ?? null;
}

// Document order: by start, then end, then key, so issues over the same text stay apart.
const inOrder = (left: ProofingIssueAt, right: ProofingIssueAt) =>
  left.from - right.from || left.to - right.to || (left.key < right.key ? -1 : 1);

/** The issues marked in the document, in document order. */
export function listProofingIssues(state: EditorState): ProofingIssueAt[] {
  const proofing = proofingKey.getState(state);
  if (!proofing?.enabled) return [];
  return proofing.decorations
    .find()
    .map((decoration) => ({
      ...(decoration.spec as { issue: ProofingIssueAt }).issue,
      from: decoration.from,
      to: decoration.to,
    }))
    .filter((issue) => state.doc.textBetween(issue.from, issue.to) === issue.text)
    .sort(inOrder);
}

// An abbreviation whose glossary entry needs the writer, as an issue of the document: of its own
// category (`abbreviation-missing`, `-archived` or `-duplicate`), from no proofer, named by its
// entry and which of that entry's abbreviations it is, so its key outlives changes around it.
function abbreviationIssue(
  state: EditorState,
  { pos, issue, entryId }: AbbreviationIssue,
  index: number,
): ProofingIssueAt {
  return {
    from: pos,
    to: pos + 1,
    kind: 'style',
    message: undefined,
    suggestions: [],
    rule: undefined,
    category: `abbreviation-${issue}`,
    source: -1,
    text: state.doc.textBetween(pos, pos + 1),
    key: `\u0000abbreviation:${entryId}:${String(index)}`,
  };
}

/**
 * The issues the status counts and the next issue visits, in document order: the proofing issues
 * marked and the abbreviations whose glossary entry needs the writer.
 */
export function listDocumentIssues(state: EditorState): ProofingIssueAt[] {
  const seen = new Map<string, number>();
  const abbreviations = listAbbreviationIssues(state).map((each) => {
    const index = seen.get(each.entryId) ?? 0;
    seen.set(each.entryId, index + 1);
    return abbreviationIssue(state, each, index);
  });
  return [...listProofingIssues(state), ...abbreviations].sort(inOrder);
}

/** The issue at a position, or null. */
export function proofingIssueAt(state: EditorState, pos: number): ProofingIssueAt | null {
  return listProofingIssues(state).find((issue) => issue.from <= pos && pos <= issue.to) ?? null;
}

// A command that changes only the proofing state, out of the history.
const proofingMeta =
  (meta: ProofingMeta, allowed = true): Command =>
  (state, dispatch) => {
    if (!proofingKey.getState(state) || !allowed) return false;
    dispatch?.(state.tr.setMeta(proofingKey, meta).setMeta('addToHistory', false));
    return true;
  };

/** Puts a suggestion in place of an issue's text, when the text is still there. */
export function replaceProofingIssue(issue: ProofingIssueAt, replacement: string): Command {
  return (state, dispatch) => {
    if (state.doc.textBetween(issue.from, issue.to) !== issue.text) return false;
    if (dispatch) {
      const marks = state.doc.resolve(issue.from + 1).marks();
      const tr = state.tr.replaceWith(issue.from, issue.to, state.schema.text(replacement, marks));
      dispatch(
        tr
          .setSelection(TextSelection.create(tr.doc, issue.from + replacement.length))
          .scrollIntoView(),
      );
    }
    return true;
  };
}

// The issues like one: the same text, found by the same rule, or of the same kind without one.
const alike = (issue: ProofingIssueAt, other: ProofingIssueAt) =>
  other.text === issue.text &&
  other.kind === issue.kind &&
  (other.rule?.id ?? null) === (issue.rule?.id ?? null);

/** How many issues are like one, itself included. */
export function countAlikeIssues(state: EditorState, issue: ProofingIssueAt): number {
  return listProofingIssues(state).filter((other) => alike(issue, other)).length;
}

/** Puts a suggestion in place of every issue like one, as one change. */
export function replaceAllProofingIssues(issue: ProofingIssueAt, replacement: string): Command {
  return (state, dispatch) => {
    const issues = listProofingIssues(state).filter((other) => alike(issue, other));
    if (issues.length === 0) return false;
    if (dispatch) {
      const tr = state.tr;
      // Later issues first, so the earlier ones' positions stay put.
      for (const each of [...issues].reverse()) {
        const marks = tr.doc.resolve(each.from + 1).marks();
        tr.replaceWith(each.from, each.to, state.schema.text(replacement, marks));
      }
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

/** Ignores this one issue, for as long as the editor is open. */
export function ignoreProofingOnce(issue: ProofingIssueAt): Command {
  return (state, dispatch) =>
    proofingMeta({ ignoreOnce: currentIssueKey(state, issue) })(state, dispatch);
}

/**
 * Ignores an issue's word everywhere in the document, for as long as the editor is open, and tells
 * the host (`onDecision`), which may keep it.
 */
export function ignoreProofingIssue(issue: ProofingIssueAt): Command {
  return (state, dispatch) => {
    const proofing = proofingKey.getState(state);
    if (!proofing) return false;
    if (dispatch) proofing.onDecision?.({ kind: 'ignore', word: issue.text });
    return proofingMeta({ ignore: issue.text })(state, dispatch);
  };
}

/** Adds an issue's word to its proofer's dictionary, then ignores it everywhere. */
export function addProofingWord(issue: ProofingIssueAt): Command {
  return (state, dispatch) => {
    const proofer = proofingKey.getState(state)?.proofers[issue.source];
    if (!proofer?.addWord) return false;
    if (dispatch) {
      void Promise.resolve(proofer.addWord(issue.text)).catch(() => undefined);
      return ignoreProofingIssue(issue)(state, dispatch);
    }
    return true;
  };
}

/** Turns an issue's rule off, in its proofer too when that keeps the reader's choice. */
export function disableProofingRule(issue: ProofingIssueAt): Command {
  return (state, dispatch) => {
    const rule = issue.rule?.id;
    if (!rule || !proofingKey.getState(state)) return false;
    if (dispatch) {
      const proofer = proofingKey.getState(state)?.proofers[issue.source];
      if (proofer?.ignoreRule) {
        void Promise.resolve(proofer.ignoreRule(rule)).catch(() => undefined);
      }
      proofingKey.getState(state)?.onDecision?.({ kind: 'disable-rule', rule });
      return proofingMeta({ disableRule: rule })(state, dispatch);
    }
    return true;
  };
}

/** Checks the document in another language, from the start. */
export function setProofingLanguage(language: string | null): Command {
  return (state, dispatch) =>
    proofingMeta({ language }, proofingKey.getState(state)?.language !== language)(state, dispatch);
}

/** Checks the whole document again, as after the proofers became available again. */
export const recheckProofing: Command = proofingMeta({ recheck: true });

/** The languages the proofers check, each once, in the order they list them. */
export function proofingLanguages(state: EditorState) {
  const seen = new Map<string, { id: string; label: string }>();
  for (const proofer of proofingKey.getState(state)?.proofers ?? []) {
    for (const language of proofer.languages ?? []) {
      if (!seen.has(language.id)) seen.set(language.id, { ...language });
    }
  }
  return [...seen.values()];
}

// The issue after the last one visited, or, after none, or when it is gone, after the selection.
function nextIssue(state: EditorState, issues: readonly ProofingIssueAt[]) {
  const visited = proofingKey.getState(state)?.visited ?? null;
  const at = visited ? issues.findIndex((issue) => issue.key === visited.key) : -1;
  if (at >= 0) return issues[at + 1] ?? issues[0];
  if (visited) return issues.find((issue) => issue.from > visited.from) ?? issues[0];
  return issues.find((issue) => issue.from >= state.selection.to) ?? issues[0];
}

/**
 * Selects the next issue (`listDocumentIssues`), wrapping to the first: the one after the issue
 * visited last, so moving the caret does not lose the place, or after the selection before any.
 * Issues over the same text are visited one by one.
 */
export const selectNextProofingIssue: Command = (state, dispatch) => {
  const next = nextIssue(state, listDocumentIssues(state));
  if (!next) return false;
  if (dispatch) {
    const selection =
      next.source < 0
        ? NodeSelection.create(state.doc, next.from)
        : TextSelection.create(state.doc, next.from, next.to);
    const tr = state.tr.setSelection(selection).scrollIntoView();
    if (proofingKey.getState(state)) {
      tr.setMeta(proofingKey, { visited: { key: next.key, from: next.from } });
    }
    dispatch(tr);
  }
  return true;
};

// The element drawing an issue: its decoration, or the abbreviation itself.
function issueElement(view: EditorView, issue: ProofingIssueAt): Element | null {
  if (issue.source < 0) return view.nodeDOM(issue.from) as Element | null;
  const { node } = view.domAtPos(issue.from + 1);
  const element = node.nodeType === node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return element?.closest(`[${PROOFING_ISSUE_ATTR}]`) ?? null;
}

/** An issue revealed at the selection, and where it stands among the issues, from 0. */
export interface RevealedProofingIssue {
  readonly issue: ProofingIssueAt;
  readonly index: number;
  readonly total: number;
}

/** How long a revealed issue keeps `data-proofing-flash`, in milliseconds. */
export const PROOFING_FLASH = 1200;

/**
 * Centres the issue at the selection in the window and flashes it (`data-proofing-flash` for
 * `PROOFING_FLASH` milliseconds), as after `selectNextProofingIssue`; with where it stands among
 * the issues, or null when no issue is at the selection.
 */
export function revealSelectedProofingIssue(view: EditorView): RevealedProofingIssue | null {
  const { state } = view;
  const issues = listDocumentIssues(state);
  const { from, to } = state.selection;
  const visited = proofingKey.getState(state)?.visited?.key;
  const at = (issue: ProofingIssueAt) => issue.from === from && issue.to === to;
  const index = Math.max(
    issues.findIndex((issue) => at(issue) && issue.key === visited),
    issues.findIndex(at),
  );
  const issue = issues[index];
  if (!issue) return null;
  issueElement(view, issue)?.scrollIntoView?.({ block: 'center' });
  // The flash is the issue's decoration, which the view draws, rather than an attribute set on
  // the drawn element, which the view would draw over.
  const flash = (key: string | null) =>
    view.dispatch(
      view.state.tr.setMeta(proofingKey, { flash: key }).setMeta('addToHistory', false),
    );
  flash(issue.key);
  view.dom.ownerDocument.defaultView?.setTimeout(() => {
    if (!view.isDestroyed && proofingKey.getState(view.state)?.flash === issue.key) flash(null);
  }, PROOFING_FLASH);
  return { issue, index, total: issues.length };
}
