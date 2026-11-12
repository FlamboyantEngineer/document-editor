// The document session: opening a document by id in room or store mode, keeping its changes and
// reporting its status, with no framework.

export type {
  DocumentSession,
  DocumentSessionOptions,
  SessionDocument,
  SessionMode,
  SessionStateContext,
  SessionStateUpdate,
} from './document-session.js';
export { createDocumentSession } from './document-session.js';
export type {
  SessionLoadPhase,
  SessionSavePhase,
  SessionStatus,
  SessionStatusStore,
} from './status.js';
export type { ValueStore } from './value-store.js';
export type { VersionGroup } from './version-groups.js';
export { groupVersions } from './version-groups.js';
export type {
  DocumentVersions,
  DocumentVersionsOptions,
  HistoricalView,
  NewVersion,
  OpenedVersion,
  VersionList,
} from './versions.js';
export { createDocumentVersions } from './versions.js';
