// Two readers open one document in its shared room, on a room server in this page: what one types
// reaches the other, and the room stores it. Each reader can go offline and come back, hide or
// leave their page, and is given rights in the room that its write guard (`openRoomChangeGuard`)
// holds them to: the editor can follow them as live capabilities, or keep every capability so the
// guard refuses what the rights do not allow. The room keeps its threads (`createRoomCommentStore`),
// seeded with `writeRoomComments`; two changes that do not merge make the room reload one writer's
// document; the guard's self-check can be made to fail; a service can write a block the editors
// cannot read. Below them, each reader opens two fields of one room.

import { useEffect, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import {
  DocumentEditor,
  DocumentSessionBoundary,
  type DocumentSessionEditorProps,
  useDocumentSession,
  useSessionValue,
} from '../../src/components/index.js';
import {
  createMemoryHost,
  type EditorHost,
  FULL_CAPABILITIES,
  type MemoryHost,
} from '../../src/host/index.js';
import type { DocumentSession } from '../../src/session/index.js';
import { createSessionRooms } from '../../test/session-rooms.js';
import { markReadyWhenSettled } from './lab-ready.js';
import { RoomComments } from './room-comments.js';
import { ROOM_SCHEMA, roomSeedWithThreads } from './room-document.js';
import { FIELD_KEYS, FIELDS_ROOM, FieldsLab, fieldsSeed } from './room-fields.js';
import {
  createGuardControls,
  createRoomLog,
  guardedRules,
  RIGHT_LABELS,
  RIGHT_NAMES,
  roomReports,
  type RoomRights,
  WRITER_RIGHTS,
} from './room-guard.js';
import { RoomTools } from './room-tools.js';
import { LAB_FONTS } from './served-fonts.js';

const DOCUMENT_ID = 'lab';

const READERS = [
  { id: 'ada', name: 'Ada' },
  { id: 'grace', name: 'Grace' },
] as const;

type Reader = (typeof READERS)[number];

const LOG = createRoomLog();
const GUARD = createGuardControls({ ada: WRITER_RIGHTS, grace: WRITER_RIGHTS });

const ROOMS = createSessionRooms({
  documents: [{ id: DOCUMENT_ID, seed: roomSeedWithThreads() }],
  rules: guardedRules({ schema: ROOM_SCHEMA, log: LOG }, GUARD),
  ...roomReports(LOG),
});

// The fields' room, on a server of its own, so each reader's connection to it is apart from theirs
// to the document's room.
const FIELD_ROOMS = createSessionRooms({
  documents: [{ id: FIELDS_ROOM, seed: fieldsSeed() }],
  rules: guardedRules({ schema: ROOM_SCHEMA, log: LOG, fields: FIELD_KEYS }, GUARD),
  ...roomReports(LOG),
});

const MEMORY = new Map<string, MemoryHost>(
  READERS.map((person) => [person.id, createMemoryHost({ person, people: [...READERS] })]),
);

const hostOf = (person: Reader): EditorHost => ({
  ...(MEMORY.get(person.id) ?? createMemoryHost({ person })),
  collaboration: ROOMS.adapter(person.id),
});

const HOSTS = new Map(READERS.map((person) => [person.id, hostOf(person)]));

// Each reader's open session, which the room's collisions change as their editor would.
const SESSIONS = new Map<string, DocumentSession>();

// What the editor is told it may do: the room's rights, or every capability when it does not
// follow them, so the guard refuses what they do not allow (DOCE-SESSION-1.4).
const capabilitiesOf = (rights: RoomRights, follows: boolean) =>
  follows
    ? {
        edit: rights.edit,
        suggest: rights.suggest,
        comment: rights.comment,
        decide: rights.decide,
        saveVersion: rights.edit,
        history: true,
      }
    : FULL_CAPABILITIES;

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

// The page's lifecycle as the reader's host tells it (DOCE-HOST-1.20): hidden, shown or left.
function PageControls({ person }: { person: Reader }) {
  const [hidden, setHidden] = useState(false);
  const memory = MEMORY.get(person.id)?.memory;
  return (
    <>
      <button
        type="button"
        onClick={() => {
          memory?.emitLifecycle(hidden ? 'visible' : 'hidden');
          setHidden(!hidden);
        }}
      >
        {hidden ? 'Show page' : 'Hide page'}
      </button>{' '}
      <button
        type="button"
        onClick={() => {
          memory?.emitLifecycle('leaving');
          setHidden(true);
        }}
      >
        Leave page
      </button>
    </>
  );
}

interface RightsProps {
  person: Reader;
  rights: RoomRights;
  follows: boolean;
  onChange: (rights: RoomRights, follows: boolean) => void;
}

// The reader's rights in the room, which its guard reads at every change (DOCE-COLLAB-6.7).
function RightsControls({ person, rights, follows, onChange }: RightsProps) {
  return (
    <fieldset>
      <legend>{`${person.name}'s rights in the room`}</legend>
      {RIGHT_NAMES.map((name) => (
        <label key={name}>
          <input
            type="checkbox"
            name={`${person.id}-${name}`}
            checked={rights[name]}
            onChange={(event) =>
              onChange({ ...rights, [name]: event.currentTarget.checked }, follows)
            }
          />{' '}
          {RIGHT_LABELS[name]}{' '}
        </label>
      ))}
      <label>
        <input
          type="checkbox"
          name={`${person.id}-follows`}
          checked={follows}
          onChange={(event) => onChange(rights, event.currentTarget.checked)}
        />{' '}
        The editor follows the rights
      </label>
    </fieldset>
  );
}

interface ReaderEditorProps {
  person: Reader;
  props: DocumentSessionEditorProps;
  /** Whether the comment store and cards let the reader moderate (DOCE-COMMENTS-2.31). */
  moderates: boolean;
}

function ReaderEditor({ person, props, moderates }: ReaderEditorProps) {
  const reload = useSessionValue(props.session.reloads);
  const provider = ROOMS.providerOf(person.id);
  const host = HOSTS.get(person.id);
  if (!provider || !host) return null;
  return (
    <RoomComments
      // A reload gives the connection a new document, which the threads are read from again.
      key={reload ? 'reloaded' : 'first'}
      doc={provider.doc}
      identity={host.identity}
      moderates={moderates}
      canComment={props.capabilities.comment}
      documentId={DOCUMENT_ID}
    >
      {(comments) => (
        <DocumentEditor
          fonts={LAB_FONTS}
          {...props}
          comments={comments}
          statusBar
          aria-label={`${person.name}'s document`}
        />
      )}
    </RoomComments>
  );
}

function ReaderPane({ person, rightsProps }: { person: Reader; rightsProps: RightsProps }) {
  const host = HOSTS.get(person.id);
  const session = useDocumentSession({
    host: host ?? hostOf(person),
    documentId: DOCUMENT_ID,
    mode: 'room',
    // A change the room refused for its merge (DOCE-SESSION-3.11).
    onRoomReload: (notice) =>
      LOG.add(
        `${person.name}'s change was refused for its merge (${notice.reason}): the editor reloaded.`,
      ),
  });
  useEffect(() => {
    if (!session) return undefined;
    SESSIONS.set(person.id, session);
    return () => {
      SESSIONS.delete(person.id);
    };
  }, [person.id, session]);
  if (!session) return null;
  return (
    <section aria-label={person.name}>
      <h2>{person.name}</h2>
      <Connection person={person.id} /> <PageControls person={person} />{' '}
      <StatusLine session={session} name={person.name} />{' '}
      <ConnectionLine session={session} name={person.name} />
      <RightsControls {...rightsProps} />
      <DocumentSessionBoundary
        session={session}
        fallback={<p>Opening the document…</p>}
        renderError={(error) => (
          <p role="alert">{`The document did not open: ${error?.kind ?? 'unknown'}`}</p>
        )}
      >
        {(props) => (
          <ReaderEditor
            person={person}
            props={props}
            moderates={rightsProps.follows ? rightsProps.rights.manageComments : true}
          />
        )}
      </DocumentSessionBoundary>
    </section>
  );
}

function RoomLogView() {
  const entries = useSyncExternalStore(LOG.subscribe, LOG.get, LOG.get);
  return (
    <section aria-label="Room log">
      <h2>Room log</h2>
      {entries.length === 0 ? (
        <p>Nothing refused yet.</p>
      ) : (
        <ol>
          {entries.map((entry) => (
            <li key={entry.id}>{entry.text}</li>
          ))}
        </ol>
      )}
    </section>
  );
}

interface Grant {
  rights: RoomRights;
  follows: boolean;
}

function Lab() {
  const [grants, setGrants] = useState<Record<string, Grant>>(() =>
    Object.fromEntries(
      READERS.map((person) => [person.id, { rights: WRITER_RIGHTS, follows: true }]),
    ),
  );
  const grant = (person: Reader) => (rights: RoomRights, follows: boolean) => {
    GUARD.rights.set(person.id, rights);
    // The host tells the open session its new capabilities (DOCE-HOST-1.16).
    MEMORY.get(person.id)?.memory.setCapabilities(capabilitiesOf(rights, follows));
    setGrants((last) => ({ ...last, [person.id]: { rights, follows } }));
  };
  return (
    <>
      <RoomTools
        rooms={ROOMS}
        sessions={SESSIONS}
        documentId={DOCUMENT_ID}
        guard={GUARD}
        log={LOG}
      />
      <RoomLogView />
      {READERS.map((person) => {
        const { rights, follows } = grants[person.id] ?? { rights: WRITER_RIGHTS, follows: true };
        return (
          <ReaderPane
            key={person.id}
            person={person}
            rightsProps={{ person, rights, follows, onChange: grant(person) }}
          />
        );
      })}
      <FieldsLab rooms={FIELD_ROOMS} hosts={MEMORY} />
    </>
  );
}

const container = document.querySelector('#lab-editor');
if (container) {
  createRoot(container).render(<Lab />);
  markReadyWhenSettled();
}
