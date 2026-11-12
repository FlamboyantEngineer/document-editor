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
export {
  type CollabChange,
  type CollabChangeKind,
  type CollabSync,
  type CollabSyncOptions,
  createCollabSync,
  getCollabSync,
  readCollabChange,
} from './sync.js';
