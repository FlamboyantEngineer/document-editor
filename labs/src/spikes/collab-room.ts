// Spike (P0-10): a collaboration-tools room server in the same process as its clients, for the lab
// and the tests. Each client socket is paired with a server connection by queued microtasks, as a
// WebSocket would carry frames, so the providers run their real handshake, echoes and awareness.

import {
  createRoomProvider,
  type RoomProvider,
  type RoomSocket,
  type RoomSocketFactory,
} from '@flamboyantengineer/collaboration-tools/client';
import {
  createMemoryPersistence,
  createRoomServer,
  type RoomServer,
  type RoomServerConnection,
} from '@flamboyantengineer/collaboration-tools/server';
import * as Y from '@y/y';

const ENDPOINT = 'ws://in-process.test/rooms';

/** A client socket wired to a room server in this process. */
class PairedSocket implements RoomSocket {
  binaryType = 'arraybuffer';
  onopen: RoomSocket['onopen'] = null;
  onmessage: RoomSocket['onmessage'] = null;
  onclose: RoomSocket['onclose'] = null;
  onerror: RoomSocket['onerror'] = null;
  connection: RoomServerConnection | null = null;
  closed = false;
  /** Bytes the client sent and received, for the measurements. */
  sent = 0;
  received = 0;

  send(data: Uint8Array<ArrayBuffer>): void {
    if (this.closed) return;
    const copy = data.slice();
    this.sent += copy.byteLength;
    queueMicrotask(() => {
      if (!this.closed) this.connection?.receive(copy);
    });
  }

  close(): void {
    this.finish(1000, '');
  }

  deliver(frame: Uint8Array): void {
    const copy = frame.slice();
    this.received += copy.byteLength;
    queueMicrotask(() => {
      if (!this.closed) this.onmessage?.({ data: copy.buffer });
    });
  }

  finish(code: number, reason: string): void {
    if (this.closed) return;
    this.closed = true;
    queueMicrotask(() => {
      this.connection?.closed();
      this.onclose?.({ code, reason });
    });
  }
}

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
  const sockets: PairedSocket[] = [];
  const createSocket: RoomSocketFactory = (url) => {
    const socket = new PairedSocket();
    sockets.push(socket);
    const { pathname, search } = new URL(url);
    socket.connection = server.connect(
      {
        send: (frame) => socket.deliver(frame),
        close: (code, reason) => socket.finish(code, reason),
      },
      { url: pathname + search, headers: {} },
    );
    queueMicrotask(() => {
      if (!socket.closed) socket.onopen?.({});
    });
    return socket;
  };
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
      return sockets.reduce(
        (total, socket) => ({
          sent: total.sent + socket.sent,
          received: total.received + socket.received,
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
