// Two writers edit one document in a shared room, on a room server in this page, each at their own
// width and zoom: what either types reaches the other, the room's seed comes from `documentToYjs`,
// and each writer's undo undoes only their own changes. Either can go offline and edit on their
// own, then come back and merge, and either can switch between the pages and the web layout. The
// page shows the harness the document each writer's editor holds (`window.collabRoom`). With
// `?document=long`, the document ends with code and a list of contents too long for one page, which
// the pages split while the room holds each whole.

import type { EditorState } from 'prosemirror-state';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { readContent } from '../../src/collab/delta.js';
import { wholeValuesOf } from '../../src/collab/guard-shape.js';
import {
  DocumentEditor,
  DocumentSessionBoundary,
  useDocumentSession,
  useSessionValue,
} from '../../src/components/index.js';
import { createMemoryHost, type EditorHost } from '../../src/host/index.js';
import type { DocumentFile } from '../../src/model/index.js';
import type { DocumentSession } from '../../src/session/index.js';
import { documentSchema } from '../../test/document-markup.js';
import { createSessionRooms } from '../../test/session-rooms.js';
import { sampleDocument } from './lab-document.js';
import { markReadyWhenSettled } from './lab-ready.js';

const DOCUMENT_ID = 'collab-room';

// The lab's document, with a long listing and a long list of contents after it when asked.
function labDocument(): DocumentFile {
  const file = sampleDocument(['Startup', 'Shutdown']);
  if (new URLSearchParams(window.location.search).get('document') !== 'long') return file;
  const lines = Array.from({ length: 90 }, (_, index) => `step ${String(index + 1)} = done`);
  const steps = Array.from({ length: 70 }, (_, index) => ({
    type: 'heading',
    attrs: { level: 2 },
    content: [{ type: 'text', text: `Check ${String(index + 1)}` }],
  }));
  file.sections[0]?.content.push(
    { type: 'codeBlock', content: [{ type: 'text', text: lines.join('\n') }] },
    { type: 'contents', attrs: { kind: 'toc', depth: 2 } },
    ...steps,
  );
  return file;
}

const ROOMS = createSessionRooms({ documents: [{ id: DOCUMENT_ID, content: labDocument() }] });

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

/** The shared room lab's probe on `window.collabRoom`. */
export interface CollabRoomProbe {
  /** The text of the document a writer's editor holds, the state its pages project. */
  canonicalText(name: string): string | null;
  /** The attributes only the pages set that a writer's room document holds other than whole. */
  pageOnlyInRoom(name: string): string[];
}

const STATES = new Map<string, EditorState>();
const probe: CollabRoomProbe = {
  canonicalText: (name) => STATES.get(name)?.doc.textContent ?? null,
  pageOnlyInRoom: (name) => {
    const person = WRITERS.find((writer) => writer.name === name);
    const doc = person ? ROOMS.providerOf(person.id)?.doc : null;
    const held = doc ? readContent(documentSchema, doc.get('content')) : null;
    const found: string[] = [];
    held?.descendants((node) => {
      for (const [attr, whole] of Object.entries(wholeValuesOf(node.type.name))) {
        const value: unknown = node.attrs[attr];
        if (value !== undefined && value !== whole) found.push(`${node.type.name}.${attr}`);
      }
      return true;
    });
    return found;
  },
};
Object.assign(window, { collabRoom: probe });

// Keeps the state a writer's editor holds where the probe reads it.
function Canonical({ name, state }: { name: string; state: EditorState }) {
  useEffect(() => {
    STATES.set(name, state);
  }, [name, state]);
  return null;
}

function WriterPane({ person }: { person: Writer }) {
  const [zoom, setZoom] = useState(person.zoom);
  const [web, setWeb] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const session = useDocumentSession({
    host: HOSTS.get(person.id) ?? hostOf(person),
    documentId: DOCUMENT_ID,
    mode: 'room',
  });
  if (!session) return null;
  return (
    <section aria-label={person.name} style={{ flex: `0 0 ${person.width}`, minWidth: 0 }}>
      <h2>{person.name}</h2>
      <Connection person={person.id} /> <StatusLine session={session} name={person.name} />{' '}
      <label>
        <input
          type="checkbox"
          name={`${person.id}-web-layout`}
          checked={web}
          onChange={(event) => setWeb(event.currentTarget.checked)}
        />{' '}
        {`${person.name}'s web layout`}
      </label>{' '}
      <label>
        <input
          type="checkbox"
          name={`${person.id}-suggesting`}
          checked={suggesting}
          onChange={(event) => setSuggesting(event.currentTarget.checked)}
        />{' '}
        {`${person.name} suggests`}
      </label>
      <DocumentSessionBoundary
        session={session}
        fallback={<p>Opening the document…</p>}
        renderError={(error) => (
          <p role="alert">{`The document did not open: ${error?.kind ?? 'unknown'}`}</p>
        )}
      >
        {(props) => (
          <>
            <Canonical name={person.name} state={props.state} />
            <DocumentEditor
              {...props}
              aria-label={`${person.name}'s document`}
              zoom={zoom}
              onZoomChange={setZoom}
              layout={web ? 'web' : 'page'}
              suggesting={suggesting}
            />
          </>
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
