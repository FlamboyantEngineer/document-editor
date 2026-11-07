export type {
  AssetAdapter,
  DocumentSave,
  DocumentStoreAdapter,
  EditorHost,
  EditorPerson,
  FeedbackAdapter,
  FeedbackTone,
  HostError,
  HostResult,
  IdentityAdapter,
  PermissionsAdapter,
  StoredAsset,
  StoredDocument,
  StoredTemplate,
  TelemetryAdapter,
  TemplateSourceAdapter,
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
export type { MemoryHostOptions } from './memory-host.js';
export { createMemoryHost } from './memory-host.js';
