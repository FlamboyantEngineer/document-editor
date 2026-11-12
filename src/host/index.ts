export type {
  AssetAdapter,
  CodeSourceAdapter,
  CommentEntry,
  CommentStoreAdapter,
  CommentThread,
  CompletionAdapter,
  DocumentSave,
  DocumentStoreAdapter,
  DocumentVersion,
  EditorHost,
  EditorPerson,
  EmbedContent,
  EmbedSnapshot,
  EmbedSource,
  EmbedSourceAdapter,
  ExternalReference,
  FeedbackAdapter,
  FeedbackTone,
  FontsAdapter,
  GlossaryAdapter,
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
  ReferenceSourceAdapter,
  ResolvedCode,
  SavedState,
  ScriptDiagnostic,
  ScriptRunnerAdapter,
  ScriptVocabularyEntry,
  StoredAsset,
  StoredDocument,
  StoredTemplate,
  TelemetryAdapter,
  TemplateLoadOptions,
  TemplateSourceAdapter,
  VariablesAdapter,
  VersionStoreAdapter,
} from './adapters.js';
export type { AssetSearchPage, DiagramAdapter, FoundAsset, StoredDiagram } from './adapters.js';
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
export type {
  CollaborationAdapter,
  DocumentDraft,
  DraftsAdapter,
  LifecycleAdapter,
  LifecycleEvent,
  RoomConnection,
  RoomConnectOptions,
  RoomState,
} from './session-adapters.js';
export type { WordListProoferOptions } from './word-list-proofer.js';
export { createWordListProofer } from './word-list-proofer.js';
