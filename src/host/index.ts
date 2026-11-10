export type {
  AssetAdapter,
  CommentEntry,
  CommentStoreAdapter,
  CommentThread,
  DocumentSave,
  DocumentStoreAdapter,
  DocumentVersion,
  EditorHost,
  EditorPerson,
  FeedbackAdapter,
  FeedbackTone,
  HostError,
  HostResult,
  IdentityAdapter,
  NewCommentThread,
  PermissionsAdapter,
  ProoferAdapter,
  ProofingIssue,
  ProofingKind,
  ProofingLanguage,
  ProofingText,
  StoredAsset,
  StoredDocument,
  StoredTemplate,
  TelemetryAdapter,
  TemplateSourceAdapter,
  VersionStoreAdapter,
} from './adapters.js';
export type {
  ConnectionAccess,
  EditingMode,
  EditingModeContext,
  EditorCapabilities,
} from './capabilities.js';
export {
  canComment,
  FULL_CAPABILITIES,
  READ_ONLY_CAPABILITIES,
  resolveEditingMode,
} from './capabilities.js';
export type { MemoryCommentsOptions } from './memory-comments.js';
export { createMemoryComments } from './memory-comments.js';
export type { MemoryHostOptions } from './memory-host.js';
export { createMemoryHost } from './memory-host.js';
export type { WordListProoferOptions } from './word-list-proofer.js';
export { createWordListProofer } from './word-list-proofer.js';
