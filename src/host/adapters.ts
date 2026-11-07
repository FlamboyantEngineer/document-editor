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

/** A stored document: its serialized content and the revision it was read at. */
export interface StoredDocument {
  id: string;
  /** Monotonic revision the host assigns; saves name the revision they build on. */
  revision: string;
  /** The serialized document, exactly as the editor produced it. */
  content: unknown;
  /** The template the document uses, when it uses one. */
  templateId?: string | undefined;
}

export interface DocumentSave {
  content: unknown;
  /** The revision this content was edited from. A newer stored revision fails as `conflict`. */
  baseRevision: string;
}

export interface DocumentStoreAdapter {
  load(documentId: string, signal?: AbortSignal): Promise<HostResult<StoredDocument>>;
  /** Saves new content and returns the new revision. */
  save(documentId: string, save: DocumentSave): Promise<HostResult<{ revision: string }>>;
}

/** A stored template payload, before its inheritance chain is resolved. */
export interface StoredTemplate {
  id: string;
  /** The template it inherits from, when it has one. */
  parentId?: string | undefined;
  payload: unknown;
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
