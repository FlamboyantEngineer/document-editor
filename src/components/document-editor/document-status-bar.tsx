// The editor's status bar: the page holding the caret, the words of the document or the selection,
// the proofing issues when the document is proofed, and whether the writer is editing, suggesting
// or reading, then the host's own items. It counts
// the state React defers, so typing in a long document never waits on the count.

import { AvatarGroup } from '@flamboyantengineer/ui-components/avatar-group';
import { Button } from '@flamboyantengineer/ui-components/button';
import { GlobeGlyph } from '@flamboyantengineer/ui-components/core';
import { DropdownMenu } from '@flamboyantengineer/ui-components/dropdown-menu';
import { StatusBar } from '@flamboyantengineer/ui-components/layout';
import { ZoomControl } from '@flamboyantengineer/ui-components/zoom-control';
import type { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { type ReactNode, useDeferredValue, useMemo } from 'react';
import {
  documentStatistics,
  isProofingPending,
  listPeers,
  listProofingIssues,
  PRESENCE_COLOR_SLOTS,
  proofingLanguages,
  proofingState,
  scrollToPeer,
  selectNextProofingIssue,
  setProofingLanguage,
} from '../../engine/index.js';
import { createHooks } from '../../utils/hooks.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import { LayoutToggle, PageJump } from './status-controls.js';
import { runCommand } from './table-actions.js';
import type { DocumentLayout } from './use-document-layout.js';

// The status bar's slots, in the editor's hooks.
const hooks = createHooks('document-editor', [
  'status-start',
  'status-end',
  'status-item',
  'proofing-status',
  'proofing-language',
  'presence',
  'zoom',
]);

/** The zoom levels the reader steps through, in percent. */
export const ZOOM_LEVELS = [50, 75, 90, 100, 110, 125, 150, 200] as const;

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
  /** The document's zoom and how the reader changes it, when they can. */
  zoom?: { readonly value: number; readonly onChange: (zoom: number) => void } | null;
  /** Switches the layout, which the bar then offers. */
  onLayoutChange?: ((layout: DocumentLayout) => void) | undefined;
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

// The proofing menu, while the document is proofed: the language it is proofed in, picked among
// those the proofers offer.
function ProofingLanguage({ view, state, labels }: ProofingProps) {
  const languages = proofingLanguages(state);
  const proofing = proofingState(state);
  if (!proofing) return null;
  const current = languages.find((language) => language.id === proofing.language);
  return (
    <DropdownMenu
      {...hooks.slot('proofing-language')}
      size="sm"
      variant="ghost"
      icon={GlobeGlyph}
      label={current?.label ?? proofing.language ?? labels.proofingLanguage}
      aria-label={labels.proofingLanguage}
      placement="top start"
      selectionMode="single"
      selectedKeys={proofing.language ? [proofing.language] : []}
      isDisabled={languages.length === 0}
      items={languages.map((language) => ({
        id: language.id,
        label: language.label,
        onAction: () => {
          if (view) runCommand(view, setProofingLanguage(language.id));
        },
      }))}
    />
  );
}

// The other people in the document, as avatars by name in their carets' colour slots; choosing
// one scrolls to their caret.
function Presence({
  view,
  state,
  labels,
}: {
  view: EditorView | null;
  state: EditorState;
  labels: DocumentEditorLabels;
}) {
  const peers = [...listPeers(state)].sort((a, b) => a.name.localeCompare(b.name));
  if (peers.length === 0) return null;
  return (
    <AvatarGroup
      {...hooks.slot('presence')}
      size="xs"
      maxVisible={5}
      nameTooltip
      colorCount={PRESENCE_COLOR_SLOTS}
      aria-label={labels.presence}
      onAction={view ? (id) => void scrollToPeer(view, id) : undefined}
      people={peers.map((peer) => ({
        id: peer.id,
        name: peer.name,
        colorIndex: peer.slot,
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
  zoom,
  onLayoutChange,
  className,
}: DocumentStatusBarProps) {
  const deferred = useDeferredValue(state);
  const statistics = useMemo(() => documentStatistics(deferred), [deferred]);
  return (
    <StatusBar className={className} aria-label={labels.statusBar}>
      <span {...hooks.slot('status-start')}>
        <span {...hooks.slot('status-item', { status: 'position' })}>
          {layout === 'page' ? (
            <PageJump view={view} labels={labels} page={statistics.page} pages={statistics.pages} />
          ) : null}
          <span>{labels.wordStatus(statistics.words, statistics.selectedWords)}</span>
        </span>
        <span {...hooks.slot('status-item', { status: 'proofing' })}>
          <ProofingLanguage view={view} state={state} labels={labels} />
          <ProofingStatus view={view} state={deferred} labels={labels} />
        </span>
        <span {...hooks.slot('status-item', { status: 'mode' })}>
          <Presence view={view} state={deferred} labels={labels} />
          <span>{labels[MODE_LABELS[mode]]}</span>
        </span>
        {items}
      </span>
      <span {...hooks.slot('status-end')}>
        {onLayoutChange ? (
          <LayoutToggle layout={layout} labels={labels} onChange={onLayoutChange} />
        ) : null}
        {zoom ? (
          <ZoomControl
            {...hooks.slot('zoom')}
            aria-label={labels.zoom}
            levels={ZOOM_LEVELS}
            value={zoom.value}
            resetValue={100}
            onChange={zoom.onChange}
          />
        ) : null}
      </span>
    </StatusBar>
  );
}
