// Shared rooms for document sessions, in the same process: a collaboration-tools room server seeded
// from documents, connected through its in-process sockets (`./testing`), and the collaboration
// adapter a host passes to open its documents in room mode. For tests and labs.

import {
  createRoomProvider,
  type RoomProvider,
} from '@flamboyantengineer/collaboration-tools/client';
import {
  createMemoryPersistence,
  createRoomServer,
  type RoomServer,
} from '@flamboyantengineer/collaboration-tools/server';
import {
  connectToServer,
  type PairedSocket,
} from '@flamboyantengineer/collaboration-tools/testing';
import * as Y from '@y/y';
import { documentToYjs } from '../src/collab/convert.js';
import { roomConnection } from '../src/collab/room-connection.js';
import type { CollaborationAdapter } from '../src/host/session-adapters.js';
import type { DocumentFile } from '../src/model/index.js';
import { documentSchema } from './document-markup.js';

/** Rooms for documents, and the readers who may only read them. */
export interface SessionRoomsOptions {
  documents: readonly { id: string; content: DocumentFile }[];
  /** The people the rooms admit read-only. */
  readers?: readonly string[];
  /** The people the rooms refuse. */
  refused?: readonly string[];
}

export interface SessionRooms {
  readonly server: RoomServer;
  /** The collaboration adapter for a person, whose connections the rooms admit as them. */
  adapter(person: string): CollaborationAdapter<Y.Doc>;
  /** The providers opened so far, in order. */
  readonly providers: readonly RoomProvider[];
  /** The provider a person opened last, to take them offline and back. */
  providerOf(person: string): RoomProvider | null;
  /** The sockets opened so far, in order, to drop or deafen. */
  readonly sockets: readonly PairedSocket[];
  close(): Promise<void>;
}

/** A room's first state: the document's content and its template pin, as one Yjs update. */
export function roomSeed(content: DocumentFile): Uint8Array {
  return documentToYjs(content, { schema: documentSchema });
}

/** Rooms for `documents` on a room server in this process (DOCE-SESSION-3.7). */
export function createSessionRooms({
  documents,
  readers = [],
  refused = [],
}: SessionRoomsOptions): SessionRooms {
  const server = createRoomServer({
    storeDebounceMs: 20,
    storeMaxDebounceMs: 100,
    host: {
      seeds: {
        seed: (room) => {
          const found = documents.find((document) => document.id === room);
          return Promise.resolve(found ? roomSeed(found.content) : null);
        },
      },
      auth: {
        admit: ({ token }) => {
          const person = token ?? 'guest';
          if (refused.includes(person)) return Promise.resolve({ ok: false, reason: 'forbidden' });
          const access = readers.includes(person) ? 'read-only' : 'read-write';
          return Promise.resolve({ ok: true, actor: { id: person }, access });
        },
      },
      persistence: createMemoryPersistence(),
    },
  });
  const { createSocket, sockets } = connectToServer(server);
  const providers: RoomProvider[] = [];
  const opened = new Map<string, RoomProvider>();
  return {
    server,
    providers,
    sockets,
    providerOf: (person) => opened.get(person) ?? null,
    adapter: (person) => ({
      connect: (documentId) => {
        const provider = createRoomProvider({
          endpoint: 'ws://in-process.test/rooms',
          room: documentId,
          doc: new Y.Doc(),
          getToken: () => person,
          createSocket,
        });
        providers.push(provider);
        opened.set(person, provider);
        return Promise.resolve({ ok: true, value: roomConnection(provider) });
      },
    }),
    async close() {
      for (const provider of providers) provider.destroy();
      await server.close();
    },
  };
}
