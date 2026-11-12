// Spike (P0-10): a collaboration-tools room server in the same process as its clients, for the lab
// and the tests, connected through collaboration-tools' in-process sockets (`./testing`), so the
// providers run their real handshake, echoes and awareness.

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

const ENDPOINT = 'ws://in-process.test/rooms';

export interface InProcessRoom {
  readonly server: RoomServer;
  /** Opens a provider on a new Yjs document for the room. */
  join(name: string): RoomProvider;
  /** Bytes every client sent and received so far. */
  traffic(): { sent: number; received: number };
  close(): Promise<void>;
}

/**
 * A room server with in-memory storage that admits everyone read-write. A new room starts from
 * `seed`, a Yjs update, as a host's seeds adapter would start it from the stored document.
 */
export function createInProcessRoom(seed: Uint8Array | null, room = 'spike'): InProcessRoom {
  const server = createRoomServer({
    host: {
      seeds: { seed: () => Promise.resolve(seed) },
      auth: {
        admit: ({ token }) =>
          Promise.resolve({ ok: true, actor: { id: token ?? 'guest' }, access: 'read-write' }),
      },
      persistence: createMemoryPersistence(),
    },
  });
  const { createSocket, sockets } = connectToServer(server);
  const providers: RoomProvider[] = [];
  return {
    server,
    join(name) {
      const provider = createRoomProvider({
        endpoint: ENDPOINT,
        room,
        doc: new Y.Doc(),
        getToken: () => name,
        createSocket,
      });
      providers.push(provider);
      return provider;
    },
    traffic() {
      const bytes = (frames: readonly Uint8Array[]) =>
        frames.reduce((total, frame) => total + frame.byteLength, 0);
      return sockets.reduce(
        (total, socket) => ({
          sent: total.sent + bytes(socket.sent),
          received: total.received + bytes(socket.received),
        }),
        { sent: 0, received: 0 },
      );
    },
    async close() {
      for (const provider of providers) provider.destroy();
      await server.close();
    },
  };
}

/** Resolves once the provider's socket has synced with the room. */
export function whenSynced(provider: RoomProvider): Promise<void> {
  return new Promise((resolve) => {
    if (provider.getState().synced) {
      resolve();
      return;
    }
    const stop = provider.subscribe((state) => {
      if (state.synced) {
        stop();
        resolve();
      }
    });
  });
}
