// The editor's status bar: the page holding the caret, the words of the document or the selection,
// the proofing issues when the document is proofed, and whether the writer is editing, suggesting
// or reading, then the host's own items. It counts
// the state React defers, so typing in a long document never waits on the count.

import { Button } from '@flamboyantengineer/ui-components/button';
import { StatusBar } from '@flamboyantengineer/ui-components/layout';
import type { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { type ReactNode, useDeferredValue, useMemo } from 'react';
import {
  documentStatistics,
  isProofingPending,
  listProofingIssues,
  proofingState,
  selectNextProofingIssue,
} from '../../engine/index.js';
import { createHooks } from '../../utils/hooks.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import { runCommand } from './table-actions.js';
import type { DocumentLayout } from './use-document-layout.js';

// The status bar's slots, in the editor's hooks.
const hooks = createHooks('document-editor', ['status-item', 'proofing-status']);

/** What the status bar reports the writer is doing. */
export type DocumentEditorMode = 'editing' | 'suggesting' | 'reading';

interface DocumentStatusBarProps {
  view: EditorView | null;
  state: EditorState;
  labels: DocumentEditorLabels;
  layout: DocumentLayout;
  mode: DocumentEditorMode;
  /** The host's own items, after the editor's. */
  items?: ReactNode;
  className?: string | undefined;
}

const MODE_LABELS = {
  editing: 'editingMode',
  suggesting: 'suggestingMode',
  reading: 'readingMode',
} as const;

// The proofing status, when the document is proofed: a button selecting the next issue.
function ProofingStatus({
  view,
  state,
  labels,
}: {
  view: EditorView | null;
  state: EditorState;
  labels: DocumentEditorLabels;
}) {
  if (!proofingState(state)) return null;
  const issues = listProofingIssues(state).length;
  const pending = isProofingPending(state);
  return (
    <Button
      {...hooks.slot('proofing-status', { pending, issues: issues > 0 })}
      variant="ghost"
      size="sm"
      tooltip={labels.nextIssue}
      isDisabled={issues === 0 || view === null}
      preventFocusOnPress
      onPress={() => {
        if (view) runCommand(view, selectNextProofingIssue);
      }}
    >
      {labels.proofingStatus(issues, pending)}
    </Button>
  );
}

/** The editor's status bar, reporting on the state shown. */
export function DocumentStatusBar({
  view,
  state,
  labels,
  layout,
  mode,
  items,
  className,
}: DocumentStatusBarProps) {
  const deferred = useDeferredValue(state);
  const statistics = useMemo(() => documentStatistics(deferred), [deferred]);
  return (
    <StatusBar className={className} aria-label={labels.statusBar}>
      <span {...hooks.slot('status-item', { status: 'position' })}>
        {layout === 'page' ? (
          <span>{labels.pageStatus(statistics.page, statistics.pages)}</span>
        ) : null}
        <span>{labels.wordStatus(statistics.words, statistics.selectedWords)}</span>
      </span>
      <span {...hooks.slot('status-item', { status: 'mode' })}>
        <ProofingStatus view={view} state={deferred} labels={labels} />
        <span>{labels[MODE_LABELS[mode]]}</span>
      </span>
      {items}
    </StatusBar>
  );
}
