// Connection phases: what a shared room's connection state means for the reader, and what they may
// do in each phase. A session (room mode) derives the phase from the room connection's state, and
// gates the reader's capabilities by it; the connection status item shows it.

import type { EditorCapabilities } from '../host/capabilities.js';
import type { RoomState } from '../host/session-adapters.js';

/**
 * Where a room connection is, for the reader: connecting (or reconnecting), synced and writable,
 * offline, synced but read-only, refused by the room, or refused for holding another generation of
 * the document than the room's.
 */
export type ConnectionPhase =
  'connecting' | 'synced' | 'offline' | 'read-only' | 'refused' | 'generation-mismatch';

/** The phase a room connection's state is in (DOCE-COLLAB-5.1). */
export function connectionPhase(state: RoomState): ConnectionPhase {
  if (state.roomGeneration !== null) return 'generation-mismatch';
  if (state.refusal !== null) return 'refused';
  if (state.status === 'disconnected') return 'offline';
  if (state.status === 'connecting' || state.access === 'pending' || !state.synced) {
    return 'connecting';
  }
  return state.access === 'read-only' ? 'read-only' : 'synced';
}

/** What the session knows beyond the connection's state. */
export interface ConnectionGateOptions {
  /** Whether the document opened from a cached state of the room, such as a room-mode draft. */
  cached: boolean;
  /** Whether the connection has completed a sync with the room since the document opened. */
  hasSynced: boolean;
}

/** What the reader may do in a phase. */
export interface ConnectionGate {
  /** Whether the reader may change the document's content, as their capabilities allow. */
  editable: boolean;
  /**
   * Whether every surface is locked until the connection recovers: no content changes, comments,
   * decisions or versions, since none of them could reach the room.
   */
  locked: boolean;
}

/**
 * What the reader may do in a phase (DOCE-COLLAB-5.2, decision D15). A document the editor holds a
 * state of, from a cache or an earlier sync, is editable at once and while offline or
 * reconnecting, its changes kept until the room takes them. One with no such state stays read-only
 * until the first sync, so a fresh editor never writes content the room's seed would repeat. A
 * read-only connection takes no content changes; a refused connection or another generation locks
 * every surface.
 */
export function connectionGate(
  phase: ConnectionPhase,
  options: ConnectionGateOptions,
): ConnectionGate {
  switch (phase) {
    case 'refused':
    case 'generation-mismatch':
      return { editable: false, locked: true };
    case 'read-only':
      return { editable: false, locked: false };
    case 'synced':
      return { editable: true, locked: false };
    case 'connecting':
    case 'offline':
      return { editable: options.cached || options.hasSynced, locked: false };
  }
}

/**
 * The reader's capabilities as a phase's gate narrows them: without content changes, no editing,
 * suggesting, deciding or saving versions; locked, no comments either. Comments otherwise stay, as
 * they reach the host's store until the room takes them. The history stays open.
 */
export function gateCapabilities(
  capabilities: EditorCapabilities,
  gate: ConnectionGate,
): EditorCapabilities {
  if (gate.editable && !gate.locked) return capabilities;
  return {
    ...capabilities,
    edit: false,
    suggest: false,
    decide: false,
    saveVersion: false,
    comment: capabilities.comment && !gate.locked,
  };
}
