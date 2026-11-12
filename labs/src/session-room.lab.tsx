// Two readers open one document in its shared room, on a room server in this page: what one types
// reaches the other, and the room stores it. Each reader can go offline and come back.

import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  DocumentEditor,
  DocumentSessionBoundary,
  useDocumentSession,
  useSessionValue,
} from '../../src/components/index.js';
import { createMemoryHost, type EditorHost } from '../../src/host/index.js';
import type { DocumentFile } from '../../src/model/index.js';
import type { DocumentSession } from '../../src/session/index.js';
import { createSessionRooms } from '../../test/session-rooms.js';
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

const ROOMS = createSessionRooms({ documents: [{ id: DOCUMENT_ID, content: DOCUMENT }] });

const READERS = [
  { id: 'ada', name: 'Ada' },
  { id: 'grace', name: 'Grace' },
];

const hostOf = (person: { id: string; name: string }): EditorHost => ({
  ...createMemoryHost({ person }),
  collaboration: ROOMS.adapter(person.id),
});

const HOSTS = new Map(READERS.map((person) => [person.id, hostOf(person)]));

function StatusLine({ session, name }: { session: DocumentSession; name: string }) {
  const status = useSessionValue(session.status);
  return (
    <output aria-label={`${name}'s status`}>
      {`${status.load} · ${status.save}${status.error ? ` · ${status.error.kind}` : ''}`}
    </output>
  );
}

function ConnectionLine({ session, name }: { session: DocumentSession; name: string }) {
  const connection = useSessionValue(session.connection);
  return <output aria-label={`${name}'s connection`}>{connection?.phase ?? 'none'}</output>;
}

function Connection({ person }: { person: string }) {
  const [online, setOnline] = useState(true);
  return (
    <button
      type="button"
      onClick={() => {
        const provider = ROOMS.providerOf(person);
        if (online) provider?.disconnect();
        else provider?.connect();
        setOnline(!online);
      }}
    >
      {online ? 'Go offline' : 'Go online'}
    </button>
  );
}

function Reader({ person }: { person: { id: string; name: string } }) {
  const host = HOSTS.get(person.id);
  const session = useDocumentSession({
    host: host ?? hostOf(person),
    documentId: DOCUMENT_ID,
    mode: 'room',
  });
  if (!session) return null;
  return (
    <section aria-label={person.name}>
      <h2>{person.name}</h2>
      <Connection person={person.id} /> <StatusLine session={session} name={person.name} />{' '}
      <ConnectionLine session={session} name={person.name} />
      <DocumentSessionBoundary
        session={session}
        fallback={<p>Opening the document…</p>}
        renderError={(error) => (
          <p role="alert">{`The document did not open: ${error?.kind ?? 'unknown'}`}</p>
        )}
      >
        {(props) => <DocumentEditor {...props} aria-label={`${person.name}'s document`} />}
      </DocumentSessionBoundary>
    </section>
  );
}

const container = document.querySelector('#lab-editor');
if (container) {
  createRoot(container).render(
    <>
      {READERS.map((person) => (
        <Reader key={person.id} person={person} />
      ))}
    </>,
  );
  markReadyWhenSettled();
}
