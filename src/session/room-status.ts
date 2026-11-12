// A room-mode session's status, read from its room connection's state.

import type { HostError } from '../host/adapters.js';
import type { RoomState } from '../host/session-adapters.js';
import type { SessionSavePhase } from './status.js';

/**
 * Whether a room's changes are kept, from the connection's state: waiting for a connection while
 * disconnected, being saved while the room has not confirmed a local change or is storing,
 * unsaved while the room holds changes it has not stored, saved once it says so, and idle before it
 * says anything (DOCE-SESSION-3.3).
 */
export function roomSavePhase(state: RoomState | null): SessionSavePhase {
  if (!state) return 'idle';
  if (state.status === 'disconnected') return 'offline';
  if (state.hasUnconfirmedChanges) return 'saving';
  if (state.saveStatus === 'saving' || state.saveStatus === 'retrying') return 'saving';
  if (state.saveStatus === 'unsaved') return 'dirty';
  if (state.saveStatus === 'saved') return 'saved';
  return 'idle';
}

/** Why the room refused the connection, or null while it has not. */
export function roomRefusal(state: RoomState): HostError | null {
  if (state.refusal === null) return null;
  const kind = state.roomGeneration === null ? 'denied' : 'conflict';
  return { kind, message: state.refusal };
}
