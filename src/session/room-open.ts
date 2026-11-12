// Opening a document in its shared room: the reader's room draft, the connection through the host's
// collaboration adapter, its first sync, and the room's shared document bound for the session. The
// binding, and with it the realtime library, loads only now (DOCE-SESSION-3.1).

import type { Schema } from 'prosemirror-model';
import type { EditorHost, HostError, HostResult } from '../host/adapters.js';
import type { EditorCapabilities } from '../host/capabilities.js';
import type { DocumentDraft, RoomConnection, RoomState } from '../host/session-adapters.js';
import { failure, loadCapabilities } from './open-document.js';
import type { RoomBinding } from './room-binding.js';
import { roomRefusal } from './room-status.js';

/** A room-mode draft as the drafts adapter keeps it. */
export type RoomDraft = Extract<DocumentDraft, { mode: 'room' }>;

/** A document's room, connected and bound, and what the reader may do there. */
export interface OpenedRoom {
  connection: RoomConnection;
  binding: RoomBinding;
  capabilities: EditorCapabilities;
  /** The draft the session opened on, without waiting for the room's first sync, or null. */
  draft: RoomDraft | null;
}

const ABORTED = failure('unavailable', 'The session was closed.');

// The reader's room draft of the document, kept through a reload, if any.
async function roomDraft(host: EditorHost, documentId: string): Promise<RoomDraft | undefined> {
  const kept = await host.drafts?.get(documentId, 'room');
  return kept?.ok && kept.value?.mode === 'room' ? kept.value : undefined;
}

// Resolves when the signal aborts.
const whenAborted = (signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) resolve();
    signal.addEventListener('abort', () => resolve(), { once: true });
  });

// Waits for the connection's first sync: null once it synced, or why it did not.
async function firstSync(connection: RoomConnection, signal: AbortSignal) {
  try {
    await Promise.race([connection.whenSynced, whenAborted(signal)]);
  } catch {
    return roomRefusal(connection.state()) ?? failure('denied', 'The room refused the connection.');
  }
  return signal.aborted ? ABORTED : null;
}

/**
 * Connects the document's room and binds its shared document once it synced, or at once when the
 * reader has a room draft to start from, unless `skipDraft`. `onConnected` runs when the connection
 * is made.
 */
export async function openRoom(
  host: EditorHost,
  {
    documentId,
    schema,
    signal,
    skipDraft = false,
  }: { documentId: string; schema: Schema; signal: AbortSignal; skipDraft?: boolean },
  onConnected: () => void,
): Promise<HostResult<OpenedRoom>> {
  const collaboration = host.collaboration;
  if (!collaboration) return { ok: false, error: failure('unavailable', 'No shared rooms.') };
  // A draft of another generation is merged in once the room synced (DOCE-SESSION-6.10).
  const draft = skipDraft ? undefined : await roomDraft(host, documentId);
  const [connected, capabilities, { bindRoom }] = await Promise.all([
    collaboration.connect(documentId, { signal, draft }),
    loadCapabilities(host, documentId),
    import('./room-binding.js'),
  ]);
  if (!connected.ok) return connected;
  const connection = connected.value;
  let error: HostError | null = signal.aborted ? ABORTED : null;
  if (!error) onConnected();
  if (!error && !draft) error = await firstSync(connection, signal);
  if (error) {
    connection.close();
    return { ok: false, error };
  }
  const isRemoteOrigin = (origin: unknown) => connection.isRemoteOrigin(origin);
  const binding = bindRoom(connection.doc, schema, isRemoteOrigin);
  return { ok: true, value: { connection, binding, capabilities, draft: draft ?? null } };
}

/**
 * Resolves true once the room stored every local change made so far, or, when the connection is
 * lost or closed first, whether the room had confirmed them all.
 */
export function whenKept(connection: RoomConnection): Promise<boolean> {
  const lost = (state: RoomState) => state.status === 'disconnected';
  const now = connection.state();
  if (lost(now)) return Promise.resolve(!now.hasUnconfirmedChanges);
  return new Promise((resolve) => {
    const stop = connection.subscribe((state) => {
      if (!lost(state)) return;
      stop();
      resolve(!state.hasUnconfirmedChanges);
    });
    void connection.whenStored().then((stored) => {
      stop();
      resolve(stored);
    });
  });
}
