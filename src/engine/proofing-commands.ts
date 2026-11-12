// The proofing commands: listing the issues the proofing plugin marks, correcting one or all like
// it with a suggestion, ignoring one or its word everywhere, adding its word to the proofer's
// dictionary, turning its rule off, picking the language, checking again, moving to the next and
// revealing it.

import { type Command, type EditorState, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
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

/** The issues marked in the document, in document order. */
export function listProofingIssues(state: EditorState): ProofingIssueAt[] {
  const proofing = proofingKey.getState(state);
  if (!proofing) return [];
  return proofing.decorations
    .find()
    .map((decoration) => ({
      ...(decoration.spec as { issue: ProofingIssueAt }).issue,
      from: decoration.from,
      to: decoration.to,
    }))
    .filter((issue) => state.doc.textBetween(issue.from, issue.to) === issue.text)
    .sort((left, right) => left.from - right.from);
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

/** Ignores an issue's word everywhere in the document, for as long as the editor is open. */
export function ignoreProofingIssue(issue: ProofingIssueAt): Command {
  return proofingMeta({ ignore: issue.text });
}

/** Adds an issue's word to its proofer's dictionary, then ignores it everywhere. */
export function addProofingWord(issue: ProofingIssueAt): Command {
  return (state, dispatch) => {
    const proofer = proofingKey.getState(state)?.proofers[issue.source];
    if (!proofer?.addWord || issue.kind !== 'spelling') return false;
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

/** Selects the next issue after the selection, wrapping to the first. */
export const selectNextProofingIssue: Command = (state, dispatch) => {
  const issues = listProofingIssues(state);
  const next = issues.find((issue) => issue.from >= state.selection.to) ?? issues[0];
  if (!next) return false;
  dispatch?.(
    state.tr.setSelection(TextSelection.create(state.doc, next.from, next.to)).scrollIntoView(),
  );
  return true;
};

// Marks the issue just revealed, for a stylesheet to flash it.
const PROOFING_FLASH_ATTR = 'data-proofing-flash';

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
  const issues = listProofingIssues(state);
  const index = issues.findIndex((issue) => issue.from === state.selection.from);
  const issue = issues[index];
  if (!issue) return null;
  const { node } = view.domAtPos(issue.from + 1);
  const element = (
    node.nodeType === node.ELEMENT_NODE ? (node as Element) : node.parentElement
  )?.closest(`[${PROOFING_ISSUE_ATTR}]`);
  const owner = view.dom.ownerDocument.defaultView;
  if (element && owner) {
    element.scrollIntoView?.({ block: 'center' });
    element.setAttribute(PROOFING_FLASH_ATTR, 'true');
    owner.setTimeout(() => element.removeAttribute(PROOFING_FLASH_ATTR), PROOFING_FLASH);
  }
  return { issue, index, total: issues.length };
}
