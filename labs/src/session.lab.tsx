// A document session on the in-memory host: the document loads by id, saves by itself after a
// pause, and reloads from the store. The controls slow the store down, fail the next save, have
// another writer save or change a block, which the session merges or asks about, turn automatic
// saves off, hide the page, reopen the session and leave it, which the unsaved-changes guard
// confirms. The load shows its measured progress until the pages are first laid out, and the
// editor's status bar shows the save status, with Retry. The Document picker also opens one pinned
// to a template, whose newer revision the host can save while it is open, and one out of step with
// its template; the draft delay sets how long changes pause before the session keeps a draft.

import {
  UnsavedChangesGuard,
  useUnsavedChangesGuard,
} from '@flamboyantengineer/ui-components/unsaved-changes-guard';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  DocumentEditor,
  DocumentSessionBoundary,
  MergeConflicts,
  SessionLoading,
  useDocumentSession,
  useSessionGuard,
  useSessionTelemetry,
  useSessionValue,
} from '../../src/components/index.js';
import { createMemoryHost, type DraftsAdapter, type MemoryHost } from '../../src/host/index.js';
import type { DocumentFile, StoredNode, TemplateFile } from '../../src/model/index.js';
import { createLoadProgress, type DocumentSession } from '../../src/session/index.js';
import { heading, text } from './lab-document.js';
import { markReadyWhenSettled } from './lab-ready.js';
import { LAB_FONTS } from './served-fonts.js';

const DOCUMENT_ID = 'lab';

// A small image for the lab's figure, whose caption the writer edits in place.
const PANEL =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="100%" height="100%" fill="#2563eb"/></svg>',
  );

const DOCUMENT: DocumentFile = {
  formatVersion: 1,
  sections: [
    {
      name: null,
      content: [
        { ...heading(1, 'Scope'), attrs: { level: 1, id: 'a0000001' } },
        {
          type: 'paragraph',
          attrs: { id: 'a0000002' },
          content: [text('The system shall report each fault within one second.')],
        },
        {
          type: 'figure',
          attrs: {
            id: 'a0000003',
            src: PANEL,
            alt: 'Fault panel',
            width: 200,
          },
          content: [{ type: 'caption', content: [{ type: 'text', text: 'Fault panel' }] }],
        },
      ],
    },
  ],
};

// A template with a notice section the writer cannot edit, and the notice of its next revision.
const notice = (words: string): TemplateFile => ({
  formatVersion: 1,
  id: 'notice',
  name: 'Notice',
  sections: [
    {
      name: 'notice',
      label: 'Notice',
      required: true,
      editable: false,
      content: [{ type: 'paragraph', content: [text(words)] }],
    },
  ],
});
const NOTICE = notice('Issued for review.');
const NEWER_NOTICE = notice('Issued for approval.');

// The lab's document pinned to the notice template, its notice section as given.
const pinnedTo = (words: string): DocumentFile => ({
  ...DOCUMENT,
  template: { id: 'notice', revision: 'rev-1' },
  sections: [
    ...DOCUMENT.sections,
    { name: 'notice', content: [{ type: 'paragraph', content: [text(words)] }] },
  ],
});

// The documents the picker opens: the lab's own, one pinned to the template, and one whose notice
// is not the template's.
const DOCUMENTS = {
  [DOCUMENT_ID]: 'Unpinned',
  pinned: 'Pinned to a template',
  drifted: 'Out of step with its template',
} as const;
type DocumentId = keyof typeof DOCUMENTS;

const HOST = createMemoryHost({
  person: { id: 'ada', name: 'Ada Lovelace' },
  templates: [NOTICE],
  documents: [
    { id: DOCUMENT_ID, content: DOCUMENT },
    { id: 'pinned', content: pinnedTo('Issued for review.') },
    { id: 'drifted', content: pinnedTo('Draft notice.') },
  ],
});

// Saves the template's next revision, as another writer would in the template workspace.
async function saveNewerTemplate() {
  const loaded = await HOST.templates.load('notice');
  if (!loaded.ok) return;
  await HOST.templates.save('notice', {
    template: NEWER_NOTICE,
    baseRevision: loaded.value.revision,
  });
}

// What the drafts adapter last did, which the lab shows.
const DRAFTS = { last: 'none', listeners: new Set<() => void>() };
const observe = (drafts: DraftsAdapter): DraftsAdapter => ({
  get: (id, mode) => drafts.get(id, mode),
  put: (id, draft) => {
    DRAFTS.last = 'kept';
    for (const listener of DRAFTS.listeners) listener();
    return drafts.put(id, draft);
  },
  clear: (id, mode) => {
    DRAFTS.last = 'cleared';
    for (const listener of DRAFTS.listeners) listener();
    return drafts.clear(id, mode);
  },
});

// The host the session opens on: the lab's, with its drafts observed.
const SESSION_HOST = { ...HOST, drafts: observe(HOST.drafts) };

function DraftLine() {
  const [last, setLast] = useState(DRAFTS.last);
  useEffect(() => {
    const listener = () => setLast(DRAFTS.last);
    DRAFTS.listeners.add(listener);
    return () => void DRAFTS.listeners.delete(listener);
  }, []);
  return <output aria-label="Draft">{last}</output>;
}

// Another writer's save of the stored document as it is now, with the block of an id changed.
async function saveAsAnotherWriter(host: MemoryHost, change?: StoredNode) {
  const stored = await host.documents.load(DOCUMENT_ID);
  if (!stored.ok) return;
  const content = structuredClone(stored.value.content);
  for (const section of content.sections) {
    section.content = section.content.map((node) =>
      change && node.attrs?.id === change.attrs?.id ? change : node,
    );
  }
  await host.documents.save(DOCUMENT_ID, { content, baseRevision: stored.value.revision });
}

const THEIR_HEADING: StoredNode = {
  ...heading(1, 'Scope and purpose'),
  attrs: { level: 1, id: 'a0000001' },
};

const THEIR_PARAGRAPH: StoredNode = {
  type: 'paragraph',
  attrs: { id: 'a0000002' },
  content: [text('The system shall report each fault within two seconds.')],
};

function SessionStatusLine({ session }: { session: DocumentSession }) {
  const status = useSessionValue(session.status);
  return (
    <output aria-label="Session status">
      {`${status.load} · ${status.save}${status.error ? ` · ${status.error.kind}` : ''}`}
    </output>
  );
}

// Leaves the session as a host's navigation would, once the guard lets the reader go.
function LeaveButton() {
  const { confirmLeave } = useUnsavedChangesGuard();
  const [left, setLeft] = useState(false);
  return (
    <>
      <button type="button" onClick={() => void confirmLeave().then(setLeft)}>
        Leave
      </button>
      {left ? <output aria-label="Left">Left the document</output> : null}
    </>
  );
}

// The load phases the session measured, by name, as the host's telemetry receives them.
function LoadMeasures({ session }: { session: DocumentSession }) {
  const [names, setNames] = useState<readonly string[]>([]);
  const [telemetry] = useState(() => ({
    measure: (name: string) => setNames((before) => [...before, name]),
  }));
  useSessionTelemetry(session, telemetry);
  return <output aria-label="Load measures">{names.join(', ')}</output>;
}

interface ControlsProps {
  session: DocumentSession;
  onReopen: () => void;
  autosave: boolean;
  onAutosaveChange: (autosave: boolean) => void;
  documentId: DocumentId;
  onDocumentChange: (id: DocumentId) => void;
  draftDelay: number;
  onDraftDelayChange: (delay: number) => void;
}

// The document opened, the template's next revision and the draft delay.
function DocumentControls({
  documentId,
  onDocumentChange,
  draftDelay,
  onDraftDelayChange,
}: Pick<ControlsProps, 'documentId' | 'onDocumentChange' | 'draftDelay' | 'onDraftDelayChange'>) {
  return (
    <fieldset>
      <legend>Document</legend>
      <label>
        Document{' '}
        <select
          value={documentId}
          onChange={(event) => onDocumentChange(event.target.value as DocumentId)}
        >
          {Object.entries(DOCUMENTS).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>{' '}
      <button type="button" onClick={() => void saveNewerTemplate()}>
        Save a newer template revision
      </button>{' '}
      <label>
        Draft delay{' '}
        <select
          value={draftDelay}
          onChange={(event) => onDraftDelayChange(Number(event.target.value))}
        >
          {[300, 2000].map((value) => (
            <option key={value} value={value}>{`${String(value)} ms`}</option>
          ))}
        </select>
      </label>{' '}
      <DraftLine />
    </fieldset>
  );
}

function Controls({ session, onReopen, autosave, onAutosaveChange, ...document }: ControlsProps) {
  const [latency, setLatency] = useState(0);
  useSessionGuard(session, 'Sample document');
  return (
    <>
      <DocumentControls {...document} />
      <fieldset>
        <legend>Store</legend>
        <label>
          Latency{' '}
          <select
            value={latency}
            onChange={(event) => {
              const value = Number(event.target.value);
              setLatency(value);
              HOST.memory.setLatency(value);
            }}
          >
            {[0, 300, 1500].map((value) => (
              <option key={value} value={value}>{`${String(value)} ms`}</option>
            ))}
          </select>
        </label>{' '}
        <button
          type="button"
          onClick={() => HOST.memory.failNext('documents.save', { kind: 'unavailable' })}
        >
          Fail next save
        </button>{' '}
        <button type="button" onClick={() => void saveAsAnotherWriter(HOST)}>
          Save as another writer
        </button>{' '}
        <button type="button" onClick={() => void saveAsAnotherWriter(HOST, THEIR_HEADING)}>
          Another writer edits the heading
        </button>{' '}
        <button type="button" onClick={() => void saveAsAnotherWriter(HOST, THEIR_PARAGRAPH)}>
          Another writer edits the paragraph
        </button>{' '}
        <label>
          <input
            type="checkbox"
            checked={autosave}
            onChange={(event) => onAutosaveChange(event.target.checked)}
          />{' '}
          Save automatically
        </label>{' '}
        <button type="button" onClick={() => void session.save()}>
          Save now
        </button>{' '}
        <button type="button" onClick={() => HOST.memory.emitLifecycle('hidden')}>
          Hide page
        </button>{' '}
        <button type="button" onClick={onReopen}>
          Reopen
        </button>{' '}
        <LeaveButton /> <SessionStatusLine session={session} /> <LoadMeasures session={session} />
      </fieldset>
    </>
  );
}

// Without automatic saves, the session saves only when asked.
const NEVER = 24 * 60 * 60 * 1000;

function OpenDocument(props: Omit<ControlsProps, 'session'>) {
  const session = useDocumentSession({
    host: SESSION_HOST,
    documentId: props.documentId,
    mode: 'store',
    autosaveDelay: props.autosave ? 800 : NEVER,
    draftDelay: props.draftDelay,
  });
  // Each opening has its own load; one given up, as the lab reopens, never moves the next.
  const [progress] = useState(() => createLoadProgress());
  useEffect(() => () => progress.cancel(), [progress]);
  if (!session) return null;
  return (
    <>
      <Controls session={session} {...props} />
      <MergeConflicts session={session} />
      <SessionLoading session={session} progress={progress} />
      <DocumentSessionBoundary
        session={session}
        renderError={(error) => (
          <p role="alert">{`The document did not open: ${error?.kind ?? 'unknown'}`}</p>
        )}
      >
        {(props) => (
          <DocumentEditor
            fonts={LAB_FONTS}
            {...props}
            loadProgress={progress}
            statusBar
            aria-label="Sample document"
          />
        )}
      </DocumentSessionBoundary>
    </>
  );
}

function Lab() {
  const [opened, setOpened] = useState(1);
  const [autosave, setAutosave] = useState(true);
  const [documentId, setDocumentId] = useState<DocumentId>(DOCUMENT_ID);
  const [draftDelay, setDraftDelay] = useState(300);
  return (
    <UnsavedChangesGuard shouldConfirmUnload={false}>
      <OpenDocument
        key={`${String(opened)}-${String(autosave)}-${documentId}-${String(draftDelay)}`}
        onReopen={() => setOpened((count) => count + 1)}
        autosave={autosave}
        onAutosaveChange={setAutosave}
        documentId={documentId}
        onDocumentChange={setDocumentId}
        draftDelay={draftDelay}
        onDraftDelayChange={setDraftDelay}
      />
    </UnsavedChangesGuard>
  );
}

const container = document.querySelector('#lab-editor');
if (container) {
  createRoot(container).render(<Lab />);
  markReadyWhenSettled();
}
