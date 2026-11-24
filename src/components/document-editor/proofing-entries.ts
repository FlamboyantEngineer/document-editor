// The context menu's proofing submenu for the issue whose mark the menu opens on: its suggestions
// under its message, a submenu replacing every issue like it with one of them, ignoring it once or
// its word everywhere, adding its word to the dictionary and turning its rule off, each disabled
// rather than left out where it does not apply.

import type { MenuEntry } from '@flamboyantengineer/ui-components/menu';
import type { EditorView } from 'prosemirror-view';
import {
  addProofingWord,
  countAlikeIssues,
  disableProofingRule,
  ignoreProofingIssue,
  ignoreProofingOnce,
  type ProofingIssueAt,
  replaceAllProofingIssues,
  replaceProofingIssue,
} from '../../engine/index.js';
import type { ContextTarget } from './context-target.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import { commandEntry } from './table-actions.js';

/** The most suggestions the menu offers for a proofing issue. */
const PROOFING_SUGGESTIONS = 5;

/** What the proofing entries are made from. */
interface ProofingEntriesOptions {
  readonly labels: DocumentEditorLabels;
  readonly editable: boolean;
}

// The issue's suggestions under its message, or a disabled entry saying it has none.
function suggestionSection(
  view: EditorView,
  issue: ProofingIssueAt | null,
  labels: DocumentEditorLabels,
) {
  const offered = issue?.suggestions.slice(0, PROOFING_SUGGESTIONS) ?? [];
  const items: MenuEntry[] = issue
    ? offered.map((suggestion, index) =>
        commandEntry(
          view,
          { id: `proofing-${String(index)}`, label: suggestion || labels.delete },
          replaceProofingIssue(issue, suggestion),
        ),
      )
    : [];
  const section: MenuEntry = {
    type: 'section',
    id: 'proofing-suggestions',
    title: issue ? (issue.message ?? labels.proofingIssue(issue.kind)) : labels.proofingMenu,
    items:
      items.length > 0
        ? items
        : [{ id: 'proofing-none', label: labels.noSuggestions, isDisabled: true }],
  };
  return { section, offered };
}

// Replaces every issue like this one with one of its suggestions, while another is like it.
function replaceAllEntry(
  view: EditorView,
  issue: ProofingIssueAt,
  {
    offered,
    labels,
  }: { readonly offered: readonly string[]; readonly labels: DocumentEditorLabels },
): MenuEntry {
  const alike = countAlikeIssues(view.state, issue) > 1;
  const items = offered.map((suggestion, index) =>
    commandEntry(
      view,
      { id: `proofing-replace-all-${String(index)}`, label: suggestion || labels.delete },
      replaceAllProofingIssues(issue, suggestion),
    ),
  );
  return alike && items.length > 0
    ? { id: 'proofing-replace-all', label: labels.replaceAll, items }
    : { id: 'proofing-replace-all', label: labels.replaceAll, isDisabled: true };
}

// The entries of a mark the issues no longer hold: there, and disabled.
const unmatchedEntries = (labels: DocumentEditorLabels): MenuEntry[] =>
  (
    [
      ['proofing-replace-all', labels.replaceAll],
      ['proofing-ignore', labels.ignoreIssue],
      ['proofing-ignore-all', labels.ignoreAll],
      ['proofing-add', labels.addToDictionary],
      ['proofing-rule', labels.disableRule],
    ] as const
  ).map(([id, label]) => ({ id, label, isDisabled: true }));

// The decisions on an issue: ignoring it once or everywhere, the dictionary and its rule.
function decisionEntries(view: EditorView, issue: ProofingIssueAt, labels: DocumentEditorLabels) {
  return [
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
    commandEntry(
      view,
      { id: 'proofing-add', label: labels.addToDictionary },
      addProofingWord(issue),
    ),
    commandEntry(
      view,
      { id: 'proofing-rule', label: labels.disableRule },
      disableProofingRule(issue),
    ),
  ];
}

/**
 * The proofing submenu for the issue whose mark the menu opens on, or at the caret from the
 * keyboard, while the writer can edit; none on text without an issue. A mark the issues no longer
 * hold still offers the submenu, with no suggestions and nothing to do.
 */
export function proofingEntries(
  view: EditorView,
  target: Pick<ContextTarget, 'proofingIssue' | 'proofingMark'>,
  { labels, editable }: ProofingEntriesOptions,
): MenuEntry[] {
  const issue = editable ? target.proofingIssue : null;
  if (!editable || (!issue && !target.proofingMark)) return [];
  const { section, offered } = suggestionSection(view, issue, labels);
  const items: MenuEntry[] = issue
    ? [
        section,
        replaceAllEntry(view, issue, { offered, labels }),
        ...decisionEntries(view, issue, labels),
      ]
    : [section, ...unmatchedEntries(labels)];
  return [{ id: 'proofing', label: labels.proofingMenu, items }];
}
