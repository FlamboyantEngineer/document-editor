// The status bar's parts, which a host may also place in its own chrome inside the editor: the page
// in view, the words, the proofing status and menu and the editing mode. Each reads the editor it is in and counts the state React defers, so typing in a
// long document never waits on it.

import { useAnnounce } from '@flamboyantengineer/ui-components/announcer';
import { Button } from '@flamboyantengineer/ui-components/button';
import { GlobeGlyph } from '@flamboyantengineer/ui-components/core';
import { DropdownMenu } from '@flamboyantengineer/ui-components/dropdown-menu';
import type { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { memo, useDeferredValue, useEffect, useMemo, useRef } from 'react';
import {
  contentLimitOf,
  documentCounts,
  documentStatistics,
  hasAbbreviationHealth,
  isProofingPending,
  listDocumentIssues,
  proofingLanguages,
  proofingState,
  selectNextProofingIssue,
  setProofingLanguage,
} from '../../engine/index.js';
import type { ProofingStatus } from '../../engine/proofing.js';
import { revealSelectedProofingIssue } from '../../engine/proofing-commands.js';
import { pageMap } from '../../pagination/index.js';
import { createHooks } from '../../utils/hooks.js';
import { type EditorContext, useDocumentEditor } from './editor-context.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import { PageJump } from './status-controls.js';
import { runCommand } from './table-actions.js';
import { useDocumentViewport } from './visible-elements.js';

const hooks = createHooks('document-editor', ['proofing-status', 'proofing-language']);

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
function useStatistics(shown: ReturnType<typeof useDeferredEditor>) {
  const deferred = shown?.deferred;
  // The pages a projection shows the state on change as it lays them out, the state unchanged.
  const pages = deferred ? pageMap(deferred, shown?.editor.view) : null;
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
  const statistics = useStatistics(shown);
  const viewport = useDocumentViewport(shown?.editor.view ?? null);
  if (!shown || !statistics || shown.editor.layout !== 'page') return null;
  const { view, labels } = shown.editor;
  const page = Math.min(viewport.page ?? statistics.page, statistics.pages);
  return <PageJump view={view} labels={labels} page={page} pages={statistics.pages} />;
}

/**
 * The document's words, or the selection's among them; while the editing keeps a limit, the words
 * or characters against it, marked once past it (DOCE-EDITOR-5.6).
 */
export function DocumentWordStatus() {
  const shown = useDeferredEditor();
  const statistics = useStatistics(shown);
  if (!shown || !statistics) return null;
  const { labels } = shown.editor;
  const limit = contentLimitOf(shown.deferred);
  const unit = limit?.words !== undefined ? 'words' : 'characters';
  const most = limit?.[unit];
  if (most === undefined) {
    return <span>{labels.wordStatus(statistics.words, statistics.selectedWords)}</span>;
  }
  const used = unit === 'words' ? statistics.words : documentCounts(shown.deferred.doc).characters;
  return <span data-over={used > most}>{labels.limitStatus(used, most, unit)}</span>;
}

// Calls `announce` each time the settled issue count changes after the first, so a screen reader
// hears the result of each check without hearing the count it opened with.
function useSettledAnnouncement(count: number | null, announce: (count: number) => void) {
  const last = useRef<number | null>(null);
  const latest = useRef(announce);
  useEffect(() => {
    latest.current = announce;
  });
  useEffect(() => {
    if (count === null) return;
    if (last.current !== null && last.current !== count) latest.current(count);
    last.current = count;
  }, [count]);
}

// Whether a state's document is checked: proofed, unless proofing is off now, or its
// abbreviations' glossary entries checked.
function isChecked(state: EditorState) {
  const proofing = proofingState(state);
  return proofing ? proofing.enabled : hasAbbreviationHealth(state);
}

/**
 * The proofing status, when the document is proofed or its abbreviations checked: a button
 * selecting, centring and flashing the next issue, announced, or saying the proofers do not
 * answer; each new count once checked is announced. The count holds the abbreviations whose
 * glossary entry needs the writer. While proofing is off, as in a view the reader cannot edit, it
 * shows nothing.
 */
export function DocumentProofingStatus() {
  const shown = useDeferredEditor();
  const announce = useAnnounce();
  const checked = shown ? isChecked(shown.deferred) : false;
  const issues = checked && shown ? listDocumentIssues(shown.deferred).length : null;
  const pending = checked && shown ? isProofingPending(shown.deferred) : true;
  useSettledAnnouncement(pending ? null : issues, (count) =>
    shown ? announce(shown.editor.labels.proofingStatus(count, false)) : undefined,
  );
  if (!shown || !checked || issues === null) return null;
  const { view, labels } = shown.editor;
  return (
    <ProofingStatusButton
      view={view}
      labels={labels}
      status={proofingState(shown.deferred)?.status ?? 'ready'}
      issues={issues}
      pending={pending}
      announce={announce}
    />
  );
}

// The status's text: the known count stays beside a notice that the proofers do not all answer.
function proofingText(
  labels: DocumentEditorLabels,
  { status, issues, pending }: { status: ProofingStatus; issues: number; pending: boolean },
): string {
  if (status === 'unavailable') {
    return issues > 0
      ? `${labels.proofingUnavailable} · ${labels.proofingStatus(issues, false)}`
      : labels.proofingUnavailable;
  }
  const count = labels.proofingStatus(issues, pending);
  return status === 'degraded' ? `${labels.proofingDegraded} · ${count}` : count;
}

// The proofing status as its values show it, drawn again only when they change (DOCE-EDITOR-1.7).
const ProofingStatusButton = memo(function ProofingStatusButton({
  view,
  labels,
  status,
  issues,
  pending,
  announce,
}: {
  view: EditorView | null;
  labels: DocumentEditorLabels;
  status: ProofingStatus;
  issues: number;
  pending: boolean;
  announce: (message: string) => void;
}) {
  const text = proofingText(labels, { status, issues, pending });
  return (
    <Button
      {...hooks.slot('proofing-status', { checking: pending, issues: issues > 0, status })}
      variant="ghost"
      size="sm"
      tooltip={issues === 0 ? labels.noIssue : labels.nextIssue}
      isDisabled={issues === 0 || view === null}
      focusableWhenDisabled={issues === 0}
      preventFocusOnPress
      onPress={() => {
        if (!view) return;
        runCommand(view, selectNextProofingIssue);
        // The selection's own scroll lands with the view's next update; centre the issue after it.
        const owner = view.dom.ownerDocument.defaultView;
        owner?.requestAnimationFrame(() =>
          owner.requestAnimationFrame(() => {
            const revealed = revealSelectedProofingIssue(view);
            if (revealed) announce(labels.proofingIssueAnnouncement(revealed));
          }),
        );
      }}
    >
      {text}
    </Button>
  );
});

/**
 * The proofing menu, while the document is proofed: the language it is proofed in, picked among
 * those the proofers offer.
 */
export function DocumentProofingLanguage() {
  const editor = useDocumentEditor();
  const proofing = editor ? proofingState(editor.state) : null;
  if (!editor || !proofing) return null;
  return (
    <ProofingLanguageMenu
      view={editor.view}
      labels={editor.labels}
      languages={proofingLanguages(editor.state)}
      language={proofing.language}
    />
  );
}

interface ProofingLanguageMenuProps {
  view: EditorView | null;
  labels: DocumentEditorLabels;
  languages: readonly { id: string; label: string }[];
  language: string | null;
}

// Whether two menus show the same: the same languages offered, each by the same label.
function sameMenu(a: ProofingLanguageMenuProps, b: ProofingLanguageMenuProps): boolean {
  return (
    a.view === b.view &&
    a.labels === b.labels &&
    a.language === b.language &&
    a.languages.length === b.languages.length &&
    a.languages.every(
      (each, index) =>
        each.id === b.languages[index]?.id && each.label === b.languages[index].label,
    )
  );
}

// The proofing menu as its values show it, drawn again only when they change (DOCE-EDITOR-1.7).
const ProofingLanguageMenu = memo(function ProofingLanguageMenu({
  view,
  labels,
  languages,
  language,
}: ProofingLanguageMenuProps) {
  const current = languages.find((each) => each.id === language);
  return (
    <DropdownMenu
      {...hooks.slot('proofing-language')}
      size="sm"
      variant="ghost"
      icon={GlobeGlyph}
      label={current?.label ?? language ?? labels.proofingLanguage}
      aria-label={labels.proofingLanguage}
      placement="top start"
      selectionMode="single"
      selectedKeys={language ? [language] : []}
      isDisabled={languages.length === 0}
      items={languages.map((each) => ({
        id: each.id,
        label: each.label,
        onAction: () => {
          if (view) runCommand(view, setProofingLanguage(each.id));
        },
      }))}
    />
  );
}, sameMenu);

/** Whether the writer is editing, suggesting, commenting or reading. */
export function DocumentModeStatus() {
  const editor = useDocumentEditor();
  if (!editor) return null;
  return <span>{editor.labels[MODE_LABELS[editor.mode]]}</span>;
}
