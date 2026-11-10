// The context menu's proofing group for the issue at the caret: its suggestions under its message,
// replacing every issue like it, ignoring it once or its word everywhere, adding its word to the
// dictionary and turning its rule off.

import type { MenuEntry } from '@flamboyantengineer/ui-components/menu';
import type { EditorView } from 'prosemirror-view';
import {
  addProofingWord,
  countAlikeIssues,
  disableProofingRule,
  ignoreProofingIssue,
  ignoreProofingOnce,
  proofingIssueAt,
  proofingState,
  replaceAllProofingIssues,
  replaceProofingIssue,
} from '../../engine/index.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import { commandEntry } from './table-actions.js';

/** The most suggestions the menu offers for a proofing issue. */
const PROOFING_SUGGESTIONS = 5;

/** The proofing entries for the issue at the caret, or none. */
export function proofingEntries(
  view: EditorView,
  { labels, editable }: { readonly labels: DocumentEditorLabels; readonly editable: boolean },
): MenuEntry[] {
  const { state } = view;
  const issue = editable ? proofingIssueAt(state, state.selection.head) : null;
  if (!issue) return [];
  const suggestions: MenuEntry[] = issue.suggestions
    .slice(0, PROOFING_SUGGESTIONS)
    .map((suggestion, index) =>
      commandEntry(
        view,
        { id: `proofing-${String(index)}`, label: suggestion },
        replaceProofingIssue(issue, suggestion),
      ),
    );
  const best = issue.suggestions[0];
  const entries: MenuEntry[] = [
    {
      type: 'section',
      id: 'proofing',
      title: issue.message ?? labels.proofingIssue(issue.kind),
      items:
        suggestions.length > 0
          ? suggestions
          : [{ id: 'proofing-none', label: labels.noSuggestions, isDisabled: true }],
    },
  ];
  if (best !== undefined && countAlikeIssues(state, issue) > 1) {
    entries.push(
      commandEntry(
        view,
        { id: 'proofing-replace-all', label: labels.replaceAll(best) },
        replaceAllProofingIssues(issue, best),
      ),
    );
  }
  entries.push(
    commandEntry(
      view,
      { id: 'proofing-ignore', label: labels.ignoreIssue },
      ignoreProofingOnce(issue),
    ),
    commandEntry(
      view,
      { id: 'proofing-ignore-all', label: labels.ignoreAll },
      ignoreProofingIssue(issue),
    ),
  );
  const proofer = proofingState(state)?.proofers[issue.source];
  if (proofer?.addWord && issue.kind === 'spelling') {
    entries.push(
      commandEntry(
        view,
        { id: 'proofing-add', label: labels.addToDictionary },
        addProofingWord(issue),
      ),
    );
  }
  if (issue.rule) {
    entries.push(
      commandEntry(
        view,
        { id: 'proofing-rule', label: labels.disableRule },
        disableProofingRule(issue),
      ),
    );
  }
  return entries;
}
