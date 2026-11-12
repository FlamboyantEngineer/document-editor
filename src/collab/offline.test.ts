// @vitest-environment node
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
import { afterEach, describe, expect, it, vi } from 'vitest';
import stored from '../../test/fixtures/yjs-pending-updates.json' with { type: 'json' };
import { createMemoryDrafts } from '../host/memory-session.js';
import type { LifecycleEvent, RoomConnection } from '../host/session-adapters.js';
import { keepRoomDrafts, readRoomGeneration, restoreRoomDraft, type RoomDraft } from './offline.js';

const providers: RoomProvider[] = [];
let server: RoomServer | null = null;

afterEach(async () => {
  for (const provider of providers.splice(0)) provider.destroy();
  await server?.close();
  server = null;
  vi.useRealTimers();
});

function startServer() {
  server = createRoomServer({
    host: {
      permissions: { rulesFor: () => ({ required: {}, otherwise: 'write' }) },
      auth: {
        admit: () =>
          Promise.resolve({
            ok: true,
            actor: { id: 'ada' },
            access: 'read-write',
            capabilities: ['write'],
          }),
      },
      persistence: createMemoryPersistence(),
    },
    storeDebounceMs: 10,
    storeMaxDebounceMs: 20,
  });
  return connectToServer(server).createSocket;
}

function openProvider(
  createSocket: ReturnType<typeof startServer>,
  doc: Y.Doc,
  unconfirmedUpdate: Uint8Array | null = null,
) {
  const provider = createRoomProvider({
    endpoint: 'ws://in-process.test/rooms',
    room: 'offline',
    doc,
    createSocket,
    unconfirmedUpdate,
  });
  providers.push(provider);
  return provider;
}

// A provider as the host's room connection.
function asConnection(provider: RoomProvider): RoomConnection<Y.Doc> {
  const state = () => {
    const { status, access, synced, hasUnconfirmedChanges, refusal, roomGeneration, saveStatus } =
      provider.getState();
    return { status, access, synced, hasUnconfirmedChanges, refusal, roomGeneration, saveStatus };
  };
  return {
    doc: provider.doc,
    awareness: provider.awareness,
    state,
    subscribe: (onState) => provider.subscribe(() => onState(state())),
    whenSynced: new Promise<void>((resolve) => {
      const stop = provider.subscribe((next) => {
        if (!next.synced) return;
        stop();
        resolve();
      });
    }),
    whenStored: () => provider.whenStored(),
    isRemoteOrigin: (origin) => provider.isRemoteOrigin(origin),
    unconfirmedUpdate: () => provider.getUnconfirmedUpdate(),
    close: () => provider.destroy(),
  };
}

const textOf = (doc: Y.Doc) => String(doc.get('content').toString());

const write = (doc: Y.Doc, at: number, text: string) => {
  doc.get('content').insert(at, text);
};

async function readDraft(drafts: ReturnType<typeof createMemoryDrafts>): Promise<RoomDraft> {
  const read = await drafts.get('doc', 'room');
  if (!read.ok || read.value?.mode !== 'room') throw new Error('No room draft was kept.');
  return read.value;
}

describe('room-mode drafts', () => {
  it('DOCE-SESSION-6.7 keeps the state, the unconfirmed changes and the confirmed base', async () => {
    const createSocket = startServer();
    const drafts = createMemoryDrafts();
    const provider = openProvider(createSocket, new Y.Doc());
    const connection = asConnection(provider);
    await connection.whenSynced;
    const kept = keepRoomDrafts({ documentId: 'doc', drafts, connection, delay: 10 });
    write(provider.doc, 0, 'Hello');
    expect(await connection.whenStored()).toBe(true);
    await vi.waitFor(async () => expect((await readDraft(drafts)).unconfirmed).toBeNull());
    const confirmed = await readDraft(drafts);
    expect(confirmed.confirmed).toEqual(confirmed.state);
    expect(confirmed.generation).toBe(readRoomGeneration(provider.doc));
    expect(confirmed.generation).not.toBeNull();

    provider.disconnect();
    write(provider.doc, 5, ' world');
    await kept.flush();
    const offline = await readDraft(drafts);
    expect(offline.unconfirmed).not.toBeNull();
    expect(offline.confirmed).toEqual(confirmed.state);
    const base = new Y.Doc();
    Y.applyUpdate(base, offline.confirmed ?? new Uint8Array());
    expect(textOf(base)).toBe('Hello');
    kept.stop();
  });

  it('DOCE-SESSION-6.7 keeps the draft at once when the page is hidden or left', async () => {
    const createSocket = startServer();
    const drafts = createMemoryDrafts();
    const provider = openProvider(createSocket, new Y.Doc());
    const connection = asConnection(provider);
    await connection.whenSynced;
    const listeners: ((event: LifecycleEvent) => void)[] = [];
    const lifecycle = {
      subscribe: (listener: (event: LifecycleEvent) => void) => {
        listeners.push(listener);
        return () => undefined;
      },
    };
    const kept = keepRoomDrafts({ documentId: 'doc', drafts, connection, lifecycle, delay: 1e6 });
    write(provider.doc, 0, 'Hello');
    for (const listener of listeners) listener('leaving');
    const draft = await vi.waitFor(() => readDraft(drafts));
    const restored = new Y.Doc();
    Y.applyUpdate(restored, draft.state);
    expect(textOf(restored)).toBe('Hello');
    kept.stop();
  });

  it('DOCE-SESSION-6.8 sends edits made offline across a reload once connected again', async () => {
    const createSocket = startServer();
    const drafts = createMemoryDrafts();
    const first = openProvider(createSocket, new Y.Doc());
    const firstConnection = asConnection(first);
    await firstConnection.whenSynced;
    const kept = keepRoomDrafts({ documentId: 'doc', drafts, connection: firstConnection });
    write(first.doc, 0, 'Hello');
    expect(await firstConnection.whenStored()).toBe(true);
    first.disconnect();
    write(first.doc, 5, ' offline');
    await kept.flush();
    kept.stop();
    first.destroy();

    // The reload: a new document from the draft, before connecting.
    const draft = await readDraft(drafts);
    const doc = new Y.Doc();
    expect(restoreRoomDraft(doc, draft)).toBe(true);
    expect(textOf(doc)).toBe('Hello offline');
    const second = openProvider(createSocket, doc, draft.unconfirmed);
    expect(await asConnection(second).whenStored()).toBe(true);

    const reader = openProvider(createSocket, new Y.Doc());
    await vi.waitFor(() => expect(textOf(reader.doc)).toBe('Hello offline'));
  });

  it('DOCE-SESSION-6.8 restores cached updates whole, whatever order they were kept in', () => {
    const updates = (stored as string[]).map(
      (base64) => new Uint8Array(Buffer.from(base64, 'base64')),
    );
    const reference = new Y.Doc();
    Y.applyUpdate(reference, Y.mergeUpdates(updates));
    const half = Math.floor(updates.length / 2);
    const doc = new Y.Doc();
    const restored = restoreRoomDraft(doc, {
      mode: 'room',
      generation: null,
      // The later updates first, as a cache could hold them.
      state: Y.mergeUpdates(updates.slice(half)),
      unconfirmed: Y.mergeUpdates(updates.slice(0, half)),
      confirmed: null,
      savedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(restored).toBe(true);
    expect(Y.encodeStateVector(doc)).toEqual(Y.encodeStateVector(reference));
  });
});
