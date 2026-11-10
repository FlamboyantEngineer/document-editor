// The editor's status bar: the page holding the caret, the words of the document or the selection,
// the proofing issues when the document is proofed, and whether the writer is editing, suggesting
// or reading, then the host's own items. It counts
// the state React defers, so typing in a long document never waits on the count.

import { AvatarGroup } from '@flamboyantengineer/ui-components/avatar-group';
import { Button } from '@flamboyantengineer/ui-components/button';
import { StatusBar } from '@flamboyantengineer/ui-components/layout';
import { SelectField } from '@flamboyantengineer/ui-components/select-field';
import type { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { type ReactNode, useDeferredValue, useMemo } from 'react';
import {
  documentStatistics,
  isProofingPending,
  listPeers,
  listProofingIssues,
  proofingLanguages,
  proofingState,
  selectNextProofingIssue,
  setProofingLanguage,
} from '../../engine/index.js';
import { createHooks } from '../../utils/hooks.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import { runCommand } from './table-actions.js';
import type { DocumentLayout } from './use-document-layout.js';

// The status bar's slots, in the editor's hooks.
const hooks = createHooks('document-editor', [
  'status-item',
  'proofing-status',
  'proofing-language',
  'presence',
]);

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

// The proofing status, when the document is proofed: a button selecting the next issue, or saying
// the proofers do not answer.
function ProofingStatus({ view, state, labels }: ProofingProps) {
  const proofing = proofingState(state);
  if (!proofing) return null;
  const issues = listProofingIssues(state).length;
  const pending = isProofingPending(state);
  const { status } = proofing;
  const text =
    status === 'unavailable'
      ? labels.proofingUnavailable
      : `${status === 'degraded' ? `${labels.proofingDegraded} · ` : ''}${labels.proofingStatus(issues, pending)}`;
  return (
    <Button
      {...hooks.slot('proofing-status', { pending, issues: issues > 0, status })}
      variant="ghost"
      size="sm"
      tooltip={labels.nextIssue}
      isDisabled={issues === 0 || view === null}
      preventFocusOnPress
      onPress={() => {
        if (view) runCommand(view, selectNextProofingIssue);
      }}
    >
      {text}
    </Button>
  );
}

interface ProofingProps {
  view: EditorView | null;
  state: EditorState;
  labels: DocumentEditorLabels;
}

// The language the document is proofed in, when the proofers offer a choice.
function ProofingLanguage({ view, state, labels }: ProofingProps) {
  const languages = proofingLanguages(state);
  const proofing = proofingState(state);
  if (!proofing || languages.length < 2) return null;
  return (
    <SelectField
      {...hooks.slot('proofing-language')}
      size="sm"
      density="compact"
      label={labels.proofingLanguage}
      labelLayout="control-only"
      options={languages}
      value={proofing.language}
      tracksChanges={false}
      onChange={(key) => {
        if (view && typeof key === 'string') runCommand(view, setProofingLanguage(key));
      }}
    />
  );
}

// The other people in the document, as avatars.
function Presence({ state, labels }: { state: EditorState; labels: DocumentEditorLabels }) {
  const peers = listPeers(state);
  if (peers.length === 0) return null;
  return (
    <AvatarGroup
      {...hooks.slot('presence')}
      size="xs"
      maxVisible={5}
      nameTooltip
      aria-label={labels.presence}
      people={peers.map((peer) => ({
        id: peer.id,
        name: peer.name,
        colorKey: peer.id,
        ...(peer.avatar ? { src: peer.avatar } : {}),
      }))}
    />
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
        <Presence state={deferred} labels={labels} />
        <ProofingLanguage view={view} state={state} labels={labels} />
        <ProofingStatus view={view} state={deferred} labels={labels} />
        <span>{labels[MODE_LABELS[mode]]}</span>
      </span>
      {items}
    </StatusBar>
  );
}
