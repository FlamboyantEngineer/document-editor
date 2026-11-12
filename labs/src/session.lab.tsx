// A document session on the in-memory host: the document loads by id, saves by itself after a
// pause, and reloads from the store. The controls slow the store down, fail the next save, have
// another writer save first, hide the page, reopen the session and leave it, which the unsaved-
// changes guard confirms. The editor's status bar shows the save status, with Retry.

import {
  UnsavedChangesGuard,
  useUnsavedChangesGuard,
} from '@flamboyantengineer/ui-components/unsaved-changes-guard';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  DocumentEditor,
  DocumentSessionBoundary,
  SessionLoading,
  useDocumentSession,
  useSessionGuard,
  useSessionTelemetry,
  useSessionValue,
} from '../../src/components/index.js';
import { createMemoryHost, type MemoryHost } from '../../src/host/index.js';
import type { DocumentFile } from '../../src/model/index.js';
import type { DocumentSession } from '../../src/session/index.js';
import { heading, text } from './lab-document.js';
import { markReadyWhenSettled } from './lab-ready.js';

const DOCUMENT_ID = 'lab';

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
      ],
    },
  ],
};

const HOST = createMemoryHost({
  person: { id: 'ada', name: 'Ada Lovelace' },
  documents: [{ id: DOCUMENT_ID, content: DOCUMENT }],
});

// Another writer's save of the stored document, as it is now, so the session's next save conflicts.
async function saveAsAnotherWriter(host: MemoryHost) {
  const stored = await host.documents.load(DOCUMENT_ID);
  if (!stored.ok) return;
  await host.documents.save(DOCUMENT_ID, {
    content: stored.value.content,
    baseRevision: stored.value.revision,
  });
}

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

function Controls({ session, onReopen }: { session: DocumentSession; onReopen: () => void }) {
  const [latency, setLatency] = useState(0);
  useSessionGuard(session, 'Sample document');
  return (
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
  );
}

function OpenDocument({ onReopen }: { onReopen: () => void }) {
  const session = useDocumentSession({
    host: HOST,
    documentId: DOCUMENT_ID,
    mode: 'store',
    autosaveDelay: 800,
  });
  if (!session) return null;
  return (
    <>
      <Controls session={session} onReopen={onReopen} />
      <DocumentSessionBoundary
        session={session}
        fallback={<SessionLoading session={session} />}
        renderError={(error) => (
          <p role="alert">{`The document did not open: ${error?.kind ?? 'unknown'}`}</p>
        )}
      >
        {(props) => <DocumentEditor {...props} statusBar aria-label="Sample document" />}
      </DocumentSessionBoundary>
    </>
  );
}

function Lab() {
  const [opened, setOpened] = useState(1);
  return (
    <UnsavedChangesGuard shouldConfirmUnload={false}>
      <OpenDocument key={opened} onReopen={() => setOpened((count) => count + 1)} />
    </UnsavedChangesGuard>
  );
}

const container = document.querySelector('#lab-editor');
if (container) {
  createRoot(container).render(<Lab />);
  markReadyWhenSettled();
}
