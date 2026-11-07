import type { DocumentFile } from '../model/format/document-format.js';
import type { TemplateFile } from '../model/format/template-format.js';
import type { EditorCapabilities } from './capabilities.js';

/** A failure the host reports for a request it could not complete. */
export interface HostError {
  kind: 'not-found' | 'denied' | 'conflict' | 'unavailable';
  /** Text the editor may show the reader. */
  message?: string | undefined;
}

/** The outcome of a host request: a value, or the reason there is none (TS12). */
export type HostResult<T> = { ok: true; value: T } | { ok: false; error: HostError };

/** A person as the editor shows them: in comments, presence, provenance and mentions. */
export interface EditorPerson {
  id: string;
  name: string;
  /** Image URL for the person's avatar. */
  avatarUrl?: string | undefined;
}

export interface IdentityAdapter {
  /** The reader using this editor instance. */
  currentPerson(): EditorPerson;
  /** People whose names match `query`, for mentions and pickers. */
  findPeople(query: string, signal?: AbortSignal): Promise<readonly EditorPerson[]>;
  /** People by id, for names in history, comments and provenance. Unknown ids are left out. */
  resolvePeople(ids: readonly string[]): Promise<readonly EditorPerson[]>;
}

export interface PermissionsAdapter {
  /** What the reader may do with the document. */
  capabilities(documentId: string): Promise<EditorCapabilities>;
}

/**
 * A saved state of a stored item. The revision is the host's own identifier, such as a UUID, which
 * the editor only compares; the sequence orders saved states, and the editor sorts by it alone.
 */
export interface SavedState {
  revision: string;
  sequence: number;
}

/** A stored document: its content, in the stored format, and the saved state it was read at. */
export interface StoredDocument extends SavedState {
  id: string;
  content: DocumentFile;
}

export interface DocumentSave {
  content: DocumentFile;
  /** The revision this content was edited from. Any other stored revision fails as `conflict`. */
  baseRevision: string;
}

export interface DocumentStoreAdapter {
  load(documentId: string, signal?: AbortSignal): Promise<HostResult<StoredDocument>>;
  /** Saves new content and returns the new saved state. */
  save(documentId: string, save: DocumentSave): Promise<HostResult<SavedState>>;
}

/** A stored template, in the stored format, before the chain it inherits is resolved. */
export interface StoredTemplate extends SavedState {
  template: TemplateFile;
}

export interface TemplateSourceAdapter {
  load(templateId: string, signal?: AbortSignal): Promise<HostResult<StoredTemplate>>;
}

/** An uploaded file the document references. */
export interface StoredAsset {
  id: string;
  /** URL the editor renders the asset from. */
  url: string;
  name: string;
  mediaType: string;
}

export interface AssetAdapter {
  upload(file: File, signal?: AbortSignal): Promise<HostResult<StoredAsset>>;
  /** URL for an asset id stored in a document. */
  resolveUrl(assetId: string): string;
}

export type FeedbackTone = 'info' | 'success' | 'warning' | 'error';

export interface FeedbackAdapter {
  /** Shows the reader a transient message, such as a failed save. */
  notify(message: { tone: FeedbackTone; text: string }): void;
}

export interface TelemetryAdapter {
  /** Records a named duration, such as the time from mount to first paint. */
  measure(name: string, durationMs: number, attributes?: Readonly<Record<string, string>>): void;
}

/**
 * Everything the editor needs from its host. Identity, permissions and the document store are
 * required; the rest are optional and leave their features off when absent.
 */
export interface EditorHost {
  identity: IdentityAdapter;
  permissions: PermissionsAdapter;
  documents: DocumentStoreAdapter;
  templates?: TemplateSourceAdapter | undefined;
  assets?: AssetAdapter | undefined;
  feedback?: FeedbackAdapter | undefined;
  telemetry?: TelemetryAdapter | undefined;
}
