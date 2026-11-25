// Two independent fields of one shared room (DOCE-COLLAB-7.1): each reader opens a summary and
// notes, each a session of its own with its own document id and `fieldKey`, over one connection
// to the room that the reader's collaboration adapter leases to both, in the web layout without a
// toolbar. The room's guard knows both fields and refuses any other root.

import * as Y from '@y/y';
import { createRoomScope, writeRoomDocument } from '../../src/collab/index.js';
import {
  DocumentEditor,
  DocumentSessionBoundary,
  useDocumentSession,
} from '../../src/components/index.js';
import type {
  CollaborationAdapter,
  EditorHost,
  HostResult,
  MemoryHost,
  RoomConnection,
} from '../../src/host/index.js';
import type { DocumentFile } from '../../src/model/index.js';
import type { SessionRooms } from '../../test/session-rooms.js';
import { text } from './lab-document.js';
import { ROOM_SCHEMA } from './room-document.js';
import { LAB_FONTS } from './served-fonts.js';

/** The room both fields share. */
export const FIELDS_ROOM = 'brief';

const FIELDS = [
  { key: 'summary', name: 'summary', words: 'A short summary of the change.' },
  { key: 'notes', name: 'notes', words: 'Notes for the people who review it.' },
] as const;

/** The fields' keys, which the room's guard knows. */
export const FIELD_KEYS = FIELDS.map((field) => field.key);

const fieldFile = (words: string, id: string): DocumentFile => ({
  formatVersion: 1,
  sections: [
    { name: null, content: [{ type: 'paragraph', attrs: { id }, content: [text(words)] }] },
  ],
});

/** The room's first state: each field's content in its own namespace. */
export function fieldsSeed(): Uint8Array {
  const doc = new Y.Doc();
  FIELDS.forEach((field, index) =>
    writeRoomDocument(doc, fieldFile(field.words, `f000000${String(index + 1)}`), {
      schema: ROOM_SCHEMA,
      scope: createRoomScope(doc, field.key),
    }),
  );
  return Y.encodeStateAsUpdate(doc);
}

type Opened = Promise<HostResult<RoomConnection<Y.Doc>>>;

// A collaboration adapter that opens one connection to the fields' room and leases it to every
// field session: closing a field ends its lease, and the last one ends the connection.
function leasedAdapter(rooms: SessionRooms, person: string): CollaborationAdapter<Y.Doc> {
  const inner = rooms.adapter(person);
  let lease: { opened: Opened; count: number } | null = null;
  return {
    connect: async (_documentId, options) => {
      lease ??= { opened: inner.connect(FIELDS_ROOM, { signal: options?.signal }), count: 0 };
      const held = lease;
      held.count += 1;
      const opened = await held.opened;
      if (!opened.ok) return opened;
      const shared = opened.value;
      let closed = false;
      const value: RoomConnection<Y.Doc> = Object.create(shared, {
        close: {
          value: () => {
            if (closed) return;
            closed = true;
            held.count -= 1;
            if (held.count > 0) return;
            shared.close();
            if (lease === held) lease = null;
          },
        },
      }) as RoomConnection<Y.Doc>;
      return { ok: true, value };
    },
  };
}

function Field({
  host,
  name,
  field,
}: {
  host: EditorHost;
  name: string;
  field: (typeof FIELDS)[number];
}) {
  const session = useDocumentSession({
    host,
    documentId: `${FIELDS_ROOM}:${field.key}`,
    mode: 'room',
    fieldKey: field.key,
  });
  if (!session) return null;
  return (
    <DocumentSessionBoundary session={session} fallback={<p>Opening the field…</p>}>
      {(props) => (
        <DocumentEditor
          fonts={LAB_FONTS}
          {...props}
          layout="web"
          toolbar={false}
          aria-label={`${name}'s ${field.name}`}
        />
      )}
    </DocumentSessionBoundary>
  );
}

const HOSTS = new Map<string, EditorHost>();

function hostOf(rooms: SessionRooms, memory: MemoryHost, person: string): EditorHost {
  const found = HOSTS.get(person);
  if (found) return found;
  const host = { ...memory, collaboration: leasedAdapter(rooms, person) };
  HOSTS.set(person, host);
  return host;
}

/** Each reader's two fields of one room, below their documents. */
export function FieldsLab({
  rooms,
  hosts,
}: {
  rooms: SessionRooms;
  hosts: ReadonlyMap<string, MemoryHost>;
}) {
  return (
    <section aria-label="Two fields in one room">
      <h2>Two fields in one room</h2>
      {[...hosts].map(([person, memory]) => {
        const name = memory.identity.currentPerson().name;
        return (
          <section key={person} aria-label={`${name}'s fields`}>
            <h3>{name}</h3>
            {FIELDS.map((field) => (
              <Field
                key={field.key}
                host={hostOf(rooms, memory, person)}
                name={name}
                field={field}
              />
            ))}
          </section>
        );
      })}
    </section>
  );
}
