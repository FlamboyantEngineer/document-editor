// Two writers edit one document in a shared room, on a room server in this page, each at their own
// width and zoom: what either types reaches the other, the room's seed comes from `documentToYjs`,
// and each writer's undo undoes only their own changes. Either can go offline and edit on their
// own, then come back and merge.

import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  DocumentEditor,
  DocumentSessionBoundary,
  useDocumentSession,
  useSessionValue,
} from '../../src/components/index.js';
import { createMemoryHost, type EditorHost } from '../../src/host/index.js';
import type { DocumentSession } from '../../src/session/index.js';
import { createSessionRooms } from '../../test/session-rooms.js';
import { sampleDocument } from './lab-document.js';
import { markReadyWhenSettled } from './lab-ready.js';

const DOCUMENT_ID = 'collab-room';

const ROOMS = createSessionRooms({
  documents: [{ id: DOCUMENT_ID, content: sampleDocument(['Startup', 'Shutdown']) }],
});

interface Writer {
  id: string;
  name: string;
  /** The writer's column, as a share of the page's width. */
  width: string;
  zoom: number;
}

const WRITERS: readonly Writer[] = [
  { id: 'ada', name: 'Ada', width: '58%', zoom: 100 },
  { id: 'grace', name: 'Grace', width: '40%', zoom: 60 },
];

const hostOf = (person: Writer): EditorHost => ({
  ...createMemoryHost({ person: { id: person.id, name: person.name } }),
  collaboration: ROOMS.adapter(person.id),
});

const HOSTS = new Map(WRITERS.map((person) => [person.id, hostOf(person)]));

function StatusLine({ session, name }: { session: DocumentSession; name: string }) {
  const status = useSessionValue(session.status);
  return <output aria-label={`${name}'s status`}>{`${status.load} · ${status.save}`}</output>;
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

function WriterPane({ person }: { person: Writer }) {
  const [zoom, setZoom] = useState(person.zoom);
  const session = useDocumentSession({
    host: HOSTS.get(person.id) ?? hostOf(person),
    documentId: DOCUMENT_ID,
    mode: 'room',
  });
  if (!session) return null;
  return (
    <section aria-label={person.name} style={{ flex: `0 0 ${person.width}`, minWidth: 0 }}>
      <h2>{person.name}</h2>
      <Connection person={person.id} /> <StatusLine session={session} name={person.name} />
      <DocumentSessionBoundary
        session={session}
        fallback={<p>Opening the document…</p>}
        renderError={(error) => (
          <p role="alert">{`The document did not open: ${error?.kind ?? 'unknown'}`}</p>
        )}
      >
        {(props) => (
          <DocumentEditor
            {...props}
            aria-label={`${person.name}'s document`}
            zoom={zoom}
            onZoomChange={setZoom}
          />
        )}
      </DocumentSessionBoundary>
    </section>
  );
}

const container = document.querySelector('#lab-editor');
if (container) {
  createRoot(container).render(
    <div style={{ display: 'flex', gap: '2%', alignItems: 'flex-start' }}>
      {WRITERS.map((person) => (
        <WriterPane key={person.id} person={person} />
      ))}
    </div>,
  );
  markReadyWhenSettled();
}
