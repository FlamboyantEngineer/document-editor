// The status bar's parts, which a host may also place in its own chrome inside the editor: the page
// in view, the words, the proofing status and menu, the other people in the document and the
// editing mode. Each reads the editor it is in and counts the state React defers, so typing in a
// long document never waits on it.

import { AvatarGroup } from '@flamboyantengineer/ui-components/avatar-group';
import { Button } from '@flamboyantengineer/ui-components/button';
import { GlobeGlyph } from '@flamboyantengineer/ui-components/core';
import { DropdownMenu } from '@flamboyantengineer/ui-components/dropdown-menu';
import { useDeferredValue, useMemo } from 'react';
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
import { pageMap } from '../../pagination/index.js';
import { createHooks } from '../../utils/hooks.js';
import { type EditorContext, useDocumentEditor } from './editor-context.js';
import { PageJump } from './status-controls.js';
import { runCommand } from './table-actions.js';
import { useDocumentViewport } from './visible-elements.js';

const hooks = createHooks('document-editor', ['proofing-status', 'proofing-language', 'presence']);

const MODE_LABELS = {
  edit: 'editingMode',
  suggest: 'suggestingMode',
  comment: 'commentingMode',
  read: 'readingMode',
} as const;

// The editor the part is in, with the state React defers.
function useDeferredEditor(): { editor: EditorContext; deferred: EditorContext['state'] } | null {
  const editor = useDocumentEditor();
  const deferred = useDeferredValue(editor?.state);
  return editor && deferred ? { editor, deferred } : null;
}

// The document's statistics on the deferred state, read from the pages its layout gives.
function useStatistics(deferred: EditorContext['state'] | undefined) {
  // The pages a projection shows the state on change as it lays them out, the state unchanged.
  const pages = deferred ? pageMap(deferred) : null;
  return useMemo(
    () => (deferred && pages ? documentStatistics(deferred, pages) : null),
    [deferred, pages],
  );
}

/**
 * On pages, the page in view among the pages (D17), which opens a field to go to a page by its
 * number; nothing in the web layout.
 */
export function DocumentPageStatus() {
  const shown = useDeferredEditor();
  const statistics = useStatistics(shown?.deferred);
  const viewport = useDocumentViewport(shown?.editor.view ?? null);
  if (!shown || !statistics || shown.editor.layout !== 'page') return null;
  const { view, labels } = shown.editor;
  const page = Math.min(viewport.page ?? statistics.page, statistics.pages);
  return <PageJump view={view} labels={labels} page={page} pages={statistics.pages} />;
}

/** The document's words, or the selection's among them. */
export function DocumentWordStatus() {
  const shown = useDeferredEditor();
  const statistics = useStatistics(shown?.deferred);
  if (!shown || !statistics) return null;
  return <span>{shown.editor.labels.wordStatus(statistics.words, statistics.selectedWords)}</span>;
}

/**
 * The proofing status, when the document is proofed: a button selecting the next issue, or saying
 * the proofers do not answer.
 */
export function DocumentProofingStatus() {
  const shown = useDeferredEditor();
  const proofing = shown ? proofingState(shown.deferred) : null;
  if (!shown || !proofing) return null;
  const { view, labels } = shown.editor;
  const issues = listProofingIssues(shown.deferred).length;
  const pending = isProofingPending(shown.deferred);
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

/**
 * The proofing menu, while the document is proofed: the language it is proofed in, picked among
 * those the proofers offer.
 */
export function DocumentProofingLanguage() {
  const editor = useDocumentEditor();
  const proofing = editor ? proofingState(editor.state) : null;
  if (!editor || !proofing) return null;
  const { view, state, labels } = editor;
  const languages = proofingLanguages(state);
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

/**
 * The other people in the document, as avatars by name in their carets' colour slots; choosing one
 * scrolls to their caret.
 */
export function DocumentPresence() {
  const shown = useDeferredEditor();
  if (!shown) return null;
  const { view, labels } = shown.editor;
  const peers = [...listPeers(shown.deferred)].sort((a, b) => a.name.localeCompare(b.name));
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

/** Whether the writer is editing, suggesting, commenting or reading. */
export function DocumentModeStatus() {
  const editor = useDocumentEditor();
  if (!editor) return null;
  return <span>{editor.labels[MODE_LABELS[editor.mode]]}</span>;
}
