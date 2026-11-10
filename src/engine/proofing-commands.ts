// The proofing commands: listing the issues the proofing plugin marks, correcting one with a
// suggestion, ignoring its word or adding it to the proofer's dictionary, and moving to the next.

import { type Command, type EditorState, TextSelection } from 'prosemirror-state';
import { type ProofingIssueAt, proofingKey, type ProofingState } from './proofing.js';

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

/** Ignores an issue's word everywhere in the document, for as long as the editor is open. */
export function ignoreProofingIssue(issue: ProofingIssueAt): Command {
  return (state, dispatch) => {
    if (!proofingKey.getState(state)) return false;
    dispatch?.(
      state.tr.setMeta(proofingKey, { ignore: issue.text }).setMeta('addToHistory', false),
    );
    return true;
  };
}

/** Adds an issue's word to the proofer's dictionary, then ignores it everywhere. */
export function addProofingWord(issue: ProofingIssueAt): Command {
  return (state, dispatch) => {
    const proofing = proofingKey.getState(state);
    if (!proofing?.proofer.addWord || issue.kind !== 'spelling') return false;
    if (dispatch) {
      void Promise.resolve(proofing.proofer.addWord(issue.text)).catch(() => undefined);
      return ignoreProofingIssue(issue)(state, dispatch);
    }
    return true;
  };
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
