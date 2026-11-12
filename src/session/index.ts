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
export type { DocumentMerge, MergeConflict, MergeInput } from './merge.js';
export { mergeDocuments } from './merge.js';
export type { MergeChoice } from './merge-conflicts.js';
export { canKeepBoth, resolveMergeConflict } from './merge-conflicts.js';
export type {
  SessionLoadPhase,
  SessionSavePhase,
  SessionStatus,
  SessionStatusStore,
} from './status.js';
export type { ValueStore } from './value-store.js';
