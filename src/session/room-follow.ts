// What a room-mode session follows on its connection: the room's status as the session's, and the
// connection's phase and gate, which narrow what the reader may do (DOCE-SESSION-3.3, 3.4, 3.8).

import { connectionGate, connectionPhase } from '../collab/connection.js';
import type { EditorCapabilities } from '../host/capabilities.js';
import type { RoomConnection } from '../host/session-adapters.js';
import type { SessionConnection } from './document-session.js';
import { roomRefusal, roomSavePhase } from './room-status.js';
import { withCapabilities } from './session-follow.js';
import type { SessionStores } from './store-session.js';

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
 * ones the host grants (`granted`).
 */
export function followConnection(
  connection: RoomConnection,
  { status, document, connection: shownConnection }: SessionStores,
  { cached, granted }: { cached: boolean; granted: () => EditorCapabilities },
) {
  let hasSynced = !cached;
  const show = () => {
    const state = connection.state();
    hasSynced ||= state.synced;
    const error = roomRefusal(state);
    const save = error ? 'error' : roomSavePhase(state);
    status.set({ ...status.get(), save, error, dirty: state.hasUnconfirmedChanges });
    const next = readConnection(connection, { cached, hasSynced });
    const last = shownConnection.get();
    if (last?.phase === next.phase && sameGate(last, next)) return;
    shownConnection.set(next);
    const shown = document.get();
    if (shown) document.set(withCapabilities(shown, granted(), next.gate));
  };
  show();
  return connection.subscribe(show);
}

const sameGate = (one: SessionConnection, other: SessionConnection) =>
  one.gate.editable === other.gate.editable && one.gate.locked === other.gate.locked;
