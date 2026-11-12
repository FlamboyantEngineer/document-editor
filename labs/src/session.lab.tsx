// A document session on the in-memory host: the document loads by id, saves by itself after a
// pause, and reloads from the store. The controls slow the store down, fail the next save, have
// another writer save first, hide the page and reopen the session.

import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  DocumentEditor,
  DocumentSessionBoundary,
  useDocumentSession,
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

function Controls({ session, onReopen }: { session: DocumentSession; onReopen: () => void }) {
  const [latency, setLatency] = useState(0);
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
      <SessionStatusLine session={session} />
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
        fallback={<p>Opening the document…</p>}
        renderError={(error) => (
          <p role="alert">{`The document did not open: ${error?.kind ?? 'unknown'}`}</p>
        )}
      >
        {(props) => <DocumentEditor {...props} aria-label="Sample document" />}
      </DocumentSessionBoundary>
    </>
  );
}

function Lab() {
  const [opened, setOpened] = useState(1);
  return <OpenDocument key={opened} onReopen={() => setOpened((count) => count + 1)} />;
}

const container = document.querySelector('#lab-editor');
if (container) {
  createRoot(container).render(<Lab />);
  markReadyWhenSettled();
}
