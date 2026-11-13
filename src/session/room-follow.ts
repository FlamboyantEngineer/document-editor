// What a room-mode session follows on its connection: the room's status as the session's, and the
// connection's phase and gate, which narrow what the reader may do (DOCE-SESSION-3.3, 3.4, 3.8).

import { connectionGate, connectionPhase } from '../collab/connection.js';
import type { HostError } from '../host/adapters.js';
import type { EditorCapabilities } from '../host/capabilities.js';
import type { RoomConnection } from '../host/session-adapters.js';
import type { SessionConnection } from './document-session.js';
import { roomRefusal, roomSavePhase } from './room-status.js';
import { withCapabilities } from './session-follow.js';
import type { SessionStores } from './store-session.js';
import type { ValueStore } from './value-store.js';

/** How a session follows its room's connection. */
export interface ConnectionFollowing {
  /** Whether the session opened on a draft of the room. */
  cached: boolean;
  /** The capabilities the host grants the reader. */
  granted: () => EditorCapabilities;
  /** Why the editor stopped following the room, once it has (DOCE-COLLAB-4.7). */
  unreadable: ValueStore<HostError | null>;
}

// Nothing the reader does would reach a room the editor no longer follows.
const LOCKED = { editable: false, locked: true };

/** The phase a room connection is in, and its gate, for a session opened on a draft or not. */
export function readConnection(
  connection: RoomConnection,
  { cached, hasSynced }: { cached: boolean; hasSynced: boolean },
): SessionConnection {
  const phase = connectionPhase(connection.state());
  return { phase, gate: connectionGate(phase, { cached, hasSynced }) };
}

/**
 * Follows a room connection until the returned function is called: the session's status, its
 * `connection` store, and the document's capabilities and editing mode as the gate narrows the
 * ones the host grants (`granted`). A room whose content the editor cannot read is an error, and
 * locks every surface.
 */
export function followConnection(
  connection: RoomConnection,
  { status, document, connection: shownConnection }: SessionStores,
  { cached, granted, unreadable }: ConnectionFollowing,
) {
  let hasSynced = !cached;
  const show = () => {
    const state = connection.state();
    hasSynced ||= state.synced;
    const unread = unreadable.get();
    const error = unread ?? roomRefusal(state);
    const save = error ? 'error' : roomSavePhase(state);
    status.set({ ...status.get(), save, error, dirty: state.hasUnconfirmedChanges });
    const read = readConnection(connection, { cached, hasSynced });
    const next = unread ? { ...read, gate: LOCKED } : read;
    const last = shownConnection.get();
    if (last?.phase === next.phase && sameGate(last, next)) return;
    shownConnection.set(next);
    const shown = document.get();
    if (shown) document.set(withCapabilities(shown, granted(), next.gate));
  };
  show();
  const stops = [connection.subscribe(show), unreadable.subscribe(show)];
  return () => {
    for (const stop of stops) stop();
  };
}

const sameGate = (one: SessionConnection, other: SessionConnection) =>
  one.gate.editable === other.gate.editable && one.gate.locked === other.gate.locked;
