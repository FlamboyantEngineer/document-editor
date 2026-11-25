// Drafts on the in-memory host: the store starts over on each reload, as after a crash, and the
// drafts live in the tab's session storage, so a reload finds the unsaved content kept and the
// session offers it. In room mode, the room server in this page stores its room in session storage
// too, so a reload opens the room as it was, on the draft the session kept, and sends what was
// written offline. The store session's page can be hidden or left, keeping its draft at once, and
// its next save made to fail.

import {
  createMemoryPersistence,
  type StoredRoomState,
} from '@flamboyantengineer/collaboration-tools/server';
import { useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import {
  DocumentEditor,
  DocumentSessionBoundary,
  useDocumentSession,
  useSessionValue,
} from '../../src/components/index.js';
import {
  createMemoryHost,
  type DocumentDraft,
  type DraftsAdapter,
  type EditorHost,
  type HostResult,
} from '../../src/host/index.js';
import type { DocumentFile } from '../../src/model/index.js';
import type { DocumentSession } from '../../src/session/index.js';
import { createSessionRooms } from '../../test/session-rooms.js';
import { heading, text } from './lab-document.js';
import { markReadyWhenSettled } from './lab-ready.js';
import { LAB_FONTS } from './served-fonts.js';

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

const done = <T,>(value: T): Promise<HostResult<T>> => Promise.resolve({ ok: true, value });

// Byte arrays as JSON keeps them: lists of numbers.
const replacer = (_key: string, value: unknown) =>
  value instanceof Uint8Array ? { bytes: [...value] } : value;
const reviver = (_key: string, value: unknown) =>
  value && typeof value === 'object' && 'bytes' in value && Array.isArray(value.bytes)
    ? new Uint8Array(value.bytes as number[])
    : value;

// How many store drafts this page kept, shown beside the store's controls.
const KEPT = (() => {
  let count = 0;
  const listeners = new Set<() => void>();
  return {
    add: () => {
      count += 1;
      for (const listener of [...listeners]) listener();
    },
    get: () => count,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
})();

function KeptCount() {
  const count = useSyncExternalStore(KEPT.subscribe, KEPT.get, KEPT.get);
  return (
    <output aria-label="Times the store kept unsaved changes">{`${String(count)} kept`}</output>
  );
}

/** Drafts in the tab's session storage, which survives a reload. */
function createSessionStorageDrafts(): DraftsAdapter {
  const key = (documentId: string, mode: DocumentDraft['mode']) =>
    `offline-lab:${mode}:${documentId}`;
  return {
    get: (documentId, mode) => {
      const stored = sessionStorage.getItem(key(documentId, mode));
      return done(stored ? (JSON.parse(stored, reviver) as DocumentDraft) : null);
    },
    put: (documentId, draft) => {
      sessionStorage.setItem(key(documentId, draft.mode), JSON.stringify(draft, replacer));
      if (draft.mode === 'store') KEPT.add();
      return done(null);
    },
    clear: (documentId, mode) => {
      sessionStorage.removeItem(key(documentId, mode));
      return done(null);
    },
  };
}

const ROOM_KEY = 'offline-lab:room-state';

// The room server's stored room, in the tab's session storage.
function createSessionStoragePersistence() {
  const kept = sessionStorage.getItem(ROOM_KEY);
  const initial: Record<string, StoredRoomState> = {};
  if (kept) initial[DOCUMENT_ID] = JSON.parse(kept, reviver) as StoredRoomState;
  const memory = createMemoryPersistence({ initial });
  return {
    load: memory.load,
    store: async (input: Parameters<typeof memory.store>[0]) => {
      const stored = await memory.store(input);
      const state = memory.peek(input.room);
      if (state) sessionStorage.setItem(ROOM_KEY, JSON.stringify(state, replacer));
      return stored;
    },
  };
}

const ROOMS = createSessionRooms({
  documents: [{ id: DOCUMENT_ID, content: DOCUMENT }],
  persistence: createSessionStoragePersistence(),
});

const ROOM_HOST: EditorHost = {
  ...createMemoryHost({ person: { id: 'ada', name: 'Ada Lovelace' } }),
  drafts: createSessionStorageDrafts(),
  collaboration: ROOMS.adapter('ada'),
};

const HOST = {
  ...createMemoryHost({
    person: { id: 'ada', name: 'Ada Lovelace' },
    documents: [{ id: DOCUMENT_ID, content: DOCUMENT }],
  }),
  drafts: createSessionStorageDrafts(),
};

function DraftOffer({ session }: { session: DocumentSession }) {
  const offer = useSessionValue(session.draft);
  if (!offer) return null;
  return (
    <div role="status" aria-label="Draft">
      {`A draft kept ${new Date(offer.savedAt).toLocaleTimeString()}${offer.outdated ? ', from an older save,' : ''} has unsaved changes. `}
      <button type="button" onClick={() => void session.restoreDraft()}>
        Restore draft
      </button>{' '}
      <button type="button" onClick={() => session.discardDraft()}>
        Discard draft
      </button>
    </div>
  );
}

function SessionStatusLine({ session, label }: { session: DocumentSession; label: string }) {
  const status = useSessionValue(session.status);
  return <output aria-label={label}>{`${status.load} · ${status.save}`}</output>;
}

function Leftovers({ session }: { session: DocumentSession }) {
  const leftovers = useSessionValue(session.conflicts);
  if (leftovers.length === 0) return null;
  return (
    <ul aria-label="Leftovers">
      {leftovers.map((leftover) => (
        <li key={leftover.id}>
          {`Block ${leftover.id} changed in the room too. `}
          <button type="button" onClick={() => void session.resolveConflict(leftover.id, 'mine')}>
            Keep mine
          </button>{' '}
          <button type="button" onClick={() => void session.resolveConflict(leftover.id, 'theirs')}>
            Keep the room's
          </button>
        </li>
      ))}
    </ul>
  );
}

function RoomControls({ session }: { session: DocumentSession }) {
  const [online, setOnline] = useState(true);
  return (
    <fieldset>
      <legend>Room</legend>
      <button
        type="button"
        onClick={() => {
          const provider = ROOMS.providerOf('ada');
          if (online) provider?.disconnect();
          else provider?.connect();
          setOnline(!online);
        }}
      >
        {online ? 'Go offline' : 'Go online'}
      </button>{' '}
      <button type="button" onClick={() => sessionStorage.removeItem(ROOM_KEY)}>
        Lose the stored room
      </button>{' '}
      <SessionStatusLine session={session} label="Room status" />
    </fieldset>
  );
}

function RoomLab() {
  const session = useDocumentSession({ host: ROOM_HOST, documentId: DOCUMENT_ID, mode: 'room' });
  if (!session) return null;
  return (
    <section aria-label="Room mode">
      <h2>Room mode</h2>
      <RoomControls session={session} />
      <Leftovers session={session} />
      <DocumentSessionBoundary
        session={session}
        fallback={<p>Opening the document…</p>}
        renderError={(error) => (
          <p role="alert">{`The document did not open: ${error?.kind ?? 'unknown'}`}</p>
        )}
      >
        {(props) => <DocumentEditor fonts={LAB_FONTS} {...props} aria-label="Room document" />}
      </DocumentSessionBoundary>
    </section>
  );
}

const DAY = 24 * 60 * 60 * 1000;

// The page's lifecycle as the host tells it (DOCE-HOST-1.20): hidden or left, the session keeps its
// draft at once, before it saves (DOCE-SESSION-6.6).
function PageControls() {
  const [hidden, setHidden] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          HOST.memory.emitLifecycle(hidden ? 'visible' : 'hidden');
          setHidden(!hidden);
        }}
      >
        {hidden ? 'Show page' : 'Hide page'}
      </button>{' '}
      <button type="button" onClick={() => HOST.memory.emitLifecycle('leaving')}>
        Leave page
      </button>{' '}
      <button
        type="button"
        onClick={() => HOST.memory.failNext('documents.save', { kind: 'unavailable' })}
      >
        Fail the next save
      </button>
    </>
  );
}

function StoreLab({ lateDrafts }: { lateDrafts: boolean }) {
  const session = useDocumentSession({
    host: HOST,
    documentId: DOCUMENT_ID,
    mode: 'store',
    // Saves only when asked, so a reload leaves the changes unsaved.
    autosaveDelay: DAY,
    // Keeps drafts only when the page goes away, when asked.
    draftDelay: lateDrafts ? DAY : undefined,
  });
  if (!session) return null;
  return (
    <>
      <fieldset>
        <legend>Store</legend>
        <button type="button" onClick={() => void session.save()}>
          Save now
        </button>{' '}
        <PageControls /> <SessionStatusLine session={session} label="Session status" />{' '}
        <KeptCount />
      </fieldset>
      <DraftOffer session={session} />
      <DocumentSessionBoundary
        session={session}
        fallback={<p>Opening the document…</p>}
        renderError={(error) => (
          <p role="alert">{`The document did not open: ${error?.kind ?? 'unknown'}`}</p>
        )}
      >
        {(props) => <DocumentEditor fonts={LAB_FONTS} {...props} aria-label="Sample document" />}
      </DocumentSessionBoundary>
    </>
  );
}

function Lab() {
  const [lateDrafts, setLateDrafts] = useState(false);
  return (
    <>
      <label>
        <input
          type="checkbox"
          name="late-drafts"
          checked={lateDrafts}
          onChange={(event) => setLateDrafts(event.currentTarget.checked)}
        />{' '}
        Keep drafts only when the page is hidden or left
      </label>
      <StoreLab key={String(lateDrafts)} lateDrafts={lateDrafts} />
    </>
  );
}

const container = document.querySelector('#lab-editor');
if (container) {
  createRoot(container).render(
    <>
      <Lab />
      <RoomLab />
    </>,
  );
  markReadyWhenSettled();
}
