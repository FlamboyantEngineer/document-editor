// A room provider, such as collaboration-tools' `createRoomProvider`, as the room connection a
// host's collaboration adapter returns (`RoomConnection`), with no dependency on its package.

import type { RoomConnection, RoomState } from '../host/session-adapters.js';

/** What the session reads from a room provider; collaboration-tools' provider has it all. */
export interface RoomProviderLike<Doc, Awareness> {
  readonly doc: Doc;
  readonly awareness: Awareness;
  getState(): RoomState;
  subscribe(listener: (state: RoomState) => void): () => void;
  whenStored(): Promise<boolean>;
  getUnconfirmedUpdate(): Uint8Array | null;
  isRemoteOrigin(origin: unknown): boolean;
  destroy(): void;
}

// Resolves once the provider first syncs; rejects once it is refused or closed first.
function firstSync(provider: RoomProviderLike<unknown, unknown>, closed: Promise<void>) {
  return new Promise<void>((resolve, reject) => {
    const settle = (state: RoomState) => {
      if (state.synced) resolve();
      else if (state.refusal !== null) reject(new Error(state.refusal));
      else return false;
      return true;
    };
    if (settle(provider.getState())) return;
    const stop = provider.subscribe((state) => {
      if (settle(state)) stop();
    });
    void closed.then(() => {
      stop();
      reject(new Error('The connection was closed.'));
    });
  });
}

/**
 * The connection a room provider keeps: its document, awareness and state, its first sync, and its
 * receipts. Closing the connection destroys the provider (DOCE-SESSION-3.7).
 */
export function roomConnection<Doc, Awareness>(
  provider: RoomProviderLike<Doc, Awareness>,
): RoomConnection<Doc, Awareness> {
  let close: () => void = () => undefined;
  const closed = new Promise<void>((resolve) => {
    close = resolve;
  });
  const whenSynced = firstSync(provider, closed);
  // A connection nobody waits on must not report an unhandled refusal.
  whenSynced.catch(() => undefined);
  return {
    doc: provider.doc,
    awareness: provider.awareness,
    state: () => provider.getState(),
    subscribe: (onState) => provider.subscribe(onState),
    whenSynced,
    whenStored: () => provider.whenStored(),
    isRemoteOrigin: (origin) => provider.isRemoteOrigin(origin),
    unconfirmedUpdate: () => provider.getUnconfirmedUpdate(),
    close: () => {
      close();
      provider.destroy();
    },
  };
}
