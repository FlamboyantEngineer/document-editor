import type { HostError } from '../host/adapters.js';

/**
 * How far a session is in opening its document: connecting to its room or loading it from the
 * store, then, in room mode, syncing with the room, then ready; or failed.
 */
export type SessionLoadPhase = 'connecting' | 'loading' | 'syncing' | 'ready' | 'failed';

/**
 * Whether the document's changes are kept: none to keep (`idle`), unsaved (`dirty`), being saved,
 * saved, failed (`error`), or waiting for a connection (`offline`).
 */
export type SessionSavePhase = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'offline';

/** A session's status, the same in room and store mode. */
export interface SessionStatus {
  readonly load: SessionLoadPhase;
  readonly save: SessionSavePhase;
  /** Why loading or the last save failed, or null. */
  readonly error: HostError | null;
  /** Whether the document has changes that are not yet kept. */
  readonly dirty: boolean;
}

/** A session's status now, and its changes. */
export interface SessionStatusStore {
  get(): SessionStatus;
  /** Calls `listener` whenever the status changes, until the returned function is called. */
  subscribe(listener: (status: SessionStatus) => void): () => void;
}
