// Presence and connection: two people in one shared room on a collaboration-tools server running in
// this page, their editors at different widths. Each shows the other's caret and selection on the
// same text, and the connection's phase in its status bar. Grace's editor opens from a cached
// state of the room or fresh, online or not, with read-write or read-only access or refused; the
// room can be replaced by a new generation, which locks both editors.

import {
  createRoomProvider,
  type RoomProvider,
} from '@flamboyantengineer/collaboration-tools/client';
import {
  createMemoryPersistence,
  createRoomServer,
  type RoomServer,
} from '@flamboyantengineer/collaboration-tools/server';
import { connectToServer } from '@flamboyantengineer/collaboration-tools/testing';
import * as Y from '@y/y';
import { EditorState } from 'prosemirror-state';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  connectionGate,
  connectionPhase,
  createAwarenessPresence,
  createCollabSync,
  type PresenceAwareness,
} from '../../src/collab/index.js';
import { ConnectionStatus, DocumentEditor } from '../../src/components/index.js';
import { createDocumentEditing, createPresence } from '../../src/engine/index.js';
import {
  BASE_TEMPLATE,
  BASE_TEMPLATE_ID,
  createDocumentSchema,
  type DocumentFile,
  readDocumentFile,
  resolveTemplateFile,
} from '../../src/model/index.js';
import { heading, text } from './lab-document.js';
import { markReadyWhenSettled } from './lab-ready.js';
import { documentToUpdate } from './spikes/collab-convert.js';

const schema = createDocumentSchema();

const TEMPLATE = resolveTemplateFile(BASE_TEMPLATE, {
  loadTemplate: (id) => (id === BASE_TEMPLATE_ID ? BASE_TEMPLATE : null),
  baseTemplateId: BASE_TEMPLATE_ID,
});

const DOCUMENT: DocumentFile = {
  formatVersion: 1,
  sections: [
    {
      name: null,
      content: [
        { ...heading(1, 'Shared notes'), attrs: { level: 1, id: 'a0000001' } },
        {
          type: 'paragraph',
          attrs: { id: 'a0000002' },
          content: [
            text(
              'Both people hold this document. The narrow editor wraps its lines elsewhere, yet each caret stays on the same word: select one in either editor to see it in the other.',
            ),
          ],
        },
        {
          type: 'paragraph',
          attrs: { id: 'a0000003' },
          content: [text('The room keeps every change until both editors have it.')],
        },
      ],
    },
  ],
};

const EMPTY: DocumentFile = {
  formatVersion: 1,
  sections: [{ name: null, content: [{ type: 'paragraph' }] }],
};

// The room's seed, which a cached state of the room also holds, so opening from it adds nothing.
const SEED = documentToUpdate(readDocumentFile(DOCUMENT, schema).doc);

type Access = 'read-write' | 'read-only' | 'refused';

const PEOPLE = {
  ada: { id: 'ada', name: 'Ada Lovelace' },
  grace: { id: 'grace', name: 'Grace Hopper' },
} as const;

// Grace's access, read by the server when she connects.
const access: Record<string, Access> = { ada: 'read-write', grace: 'read-write' };

function createServer(): RoomServer {
  return createRoomServer({
    host: {
      seeds: { seed: () => Promise.resolve(SEED) },
      auth: {
        admit: ({ token }) => {
          const id = token ?? 'guest';
          const given = access[id] ?? 'read-write';
          return Promise.resolve(
            given === 'refused'
              ? { ok: false, reason: 'forbidden' }
              : { ok: true, actor: { id }, access: given },
          );
        },
      },
      persistence: createMemoryPersistence(),
    },
  });
}

// The page's room server, which "Replace the room" swaps for a new one with a new generation.
let sockets = connectToServer(createServer());
const providers = new Set<RoomProvider>();

function replaceRoom() {
  sockets = connectToServer(createServer());
  for (const provider of providers) {
    provider.disconnect();
    provider.connect();
  }
}

interface PersonProps {
  person: (typeof PEOPLE)[keyof typeof PEOPLE];
  /** Whether the editor opens from a cached state of the room. */
  cached: boolean;
  online: boolean;
}

// One person's editor: their provider, the editor state bound to it once it may be, and the
// connection's phase.
function PersonEditor({ person, cached, online }: PersonProps) {
  const provider = useMemo(() => {
    const doc = new Y.Doc();
    if (cached) Y.applyUpdate(doc, SEED);
    const created = createRoomProvider({
      endpoint: 'ws://in-process.test/rooms',
      room: 'lab',
      doc,
      getToken: () => person.id,
      createSocket: (...args) => sockets.createSocket(...args),
      connect: false,
    });
    providers.add(created);
    return created;
  }, [person.id, cached]);
  useEffect(
    () => () => {
      providers.delete(provider);
      provider.destroy();
    },
    [provider],
  );
  useEffect(() => {
    if (online) provider.connect();
    else provider.disconnect();
  }, [provider, online]);
  const [room, setRoom] = useState(() => provider.getState());
  useEffect(() => provider.subscribe(setRoom), [provider]);
  const phase = connectionPhase(room);
  const [hasSynced, setHasSynced] = useState(false);
  if (room.synced && !hasSynced) setHasSynced(true);
  // Without a cached state, the editor binds the room only once it has synced, so it never
  // writes its own document into a room that already holds one.
  const bound = cached || hasSynced;
  const gate = connectionGate(phase, { cached, hasSynced });
  return (
    <PersonDocument
      key={bound ? 'bound' : 'waiting'}
      person={person}
      provider={provider}
      bound={bound}
      editable={gate.editable}
      status={<ConnectionStatus phase={phase} editable={gate.editable} />}
    />
  );
}

interface PersonDocumentProps {
  person: PersonProps['person'];
  provider: RoomProvider;
  /** Whether the editor state runs the sync and presence plugins on the provider. */
  bound: boolean;
  editable: boolean;
  status: ReactNode;
}

// The editor state for one provider: an empty document, which the room's replaces once bound.
function createPersonState({ person, provider, bound }: PersonDocumentProps): EditorState {
  const plugins = [
    createPresence(),
    ...createDocumentEditing(schema, { history: false, author: () => person.id }),
  ];
  if (bound) {
    plugins.push(
      createAwarenessPresence({
        awareness: provider.awareness as unknown as PresenceAwareness,
        user: person,
        idleAfter: 30_000,
      }),
      createCollabSync({
        doc: provider.doc,
        isRemoteOrigin: (origin) => provider.isRemoteOrigin(origin),
      }),
    );
  }
  return EditorState.create({ doc: readDocumentFile(EMPTY, schema).doc, plugins });
}

function PersonDocument(props: PersonDocumentProps) {
  const [state, setState] = useState(() => createPersonState(props));
  return (
    <DocumentEditor
      state={state}
      onStateChange={setState}
      template={TEMPLATE}
      layout="web"
      editable={props.editable}
      toolbar={false}
      statusBar
      statusItems={props.status}
    />
  );
}

function Lab() {
  const [graceCached, setGraceCached] = useState(true);
  const [graceOnline, setGraceOnline] = useState(true);
  const [graceAccess, setGraceAccess] = useState<Access>('read-write');
  const [opened, setOpened] = useState(0);
  const reopen = () => setOpened((count) => count + 1);
  return (
    <>
      <div className="lab-controls">
        <fieldset>
          <legend>Grace’s editor</legend>
          <label>
            Opens{' '}
            <select
              value={graceCached ? 'cached' : 'fresh'}
              onChange={(event) => {
                setGraceCached(event.target.value === 'cached');
                reopen();
              }}
            >
              <option value="cached">From a cached state</option>
              <option value="fresh">Fresh</option>
            </select>
          </label>
          <label>
            Access{' '}
            <select
              value={graceAccess}
              onChange={(event) => {
                const value = event.target.value as Access;
                access.grace = value;
                setGraceAccess(value);
                reopen();
              }}
            >
              <option value="read-write">Read and write</option>
              <option value="read-only">Read only</option>
              <option value="refused">Refused</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={graceOnline}
              onChange={(event) => setGraceOnline(event.target.checked)}
            />{' '}
            Grace online
          </label>
          <button type="button" onClick={reopen}>
            Reopen Grace’s editor
          </button>
        </fieldset>
        <button type="button" onClick={replaceRoom}>
          Replace the room
        </button>
      </div>
      <div className="lab-presence">
        <section className="lab-presence__pane" aria-label={PEOPLE.ada.name}>
          <h2>{PEOPLE.ada.name}</h2>
          <PersonEditor person={PEOPLE.ada} cached online />
        </section>
        <section
          className="lab-presence__pane lab-presence__pane--narrow"
          aria-label={PEOPLE.grace.name}
        >
          <h2>{PEOPLE.grace.name}</h2>
          <PersonEditor
            key={opened}
            person={PEOPLE.grace}
            cached={graceCached}
            online={graceOnline}
          />
        </section>
      </div>
    </>
  );
}

const root = document.getElementById('lab-editor');
if (root) {
  createRoot(root).render(<Lab />);
  markReadyWhenSettled();
}
