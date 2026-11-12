export {
  type AwarenessChanges,
  type AwarenessPresenceOptions,
  createAwarenessPresence,
  type PresenceAwareness,
  type PresenceLifecycle,
  type PresenceUser,
  readAwarenessPeers,
} from './awareness.js';
export { createRoomCommentStore, type RoomCommentStoreOptions } from './comment-store.js';
export {
  type ConnectionGate,
  connectionGate,
  type ConnectionGateOptions,
  type ConnectionPhase,
  connectionPhase,
  gateCapabilities,
} from './connection.js';
export { roomConnection, type RoomProviderLike } from './room-connection.js';
export {
  COMMENTS_TYPE,
  documentToYjs,
  META_TYPE,
  readRoomDocument,
  type RoomReadOptions,
  type RoomWriteOptions,
  writeRoomDocument,
  yjsToDocument,
} from './convert.js';
export {
  type CollabChange,
  type CollabChangeKind,
  type CollabSync,
  type CollabSyncOptions,
  createCollabSync,
  getCollabSync,
  readCollabChange,
} from './sync.js';
