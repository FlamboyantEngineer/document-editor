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

/** A saved version of a document. */
export interface DocumentVersion extends SavedState {
  /** When it was saved: an ISO 8601 date and time. */
  savedAt: string;
  /** The id of the person who saved it, when the host knows. */
  author: string | null;
  /** The version's name; null for a version saved automatically. */
  label: string | null;
}

/** A document's saved versions, to show its history and compare one with another. */
export interface VersionStoreAdapter {
  /** The document's versions, newest first. */
  list(documentId: string, signal?: AbortSignal): Promise<HostResult<DocumentVersion[]>>;
  /** A version's content, by its revision. */
  load(
    documentId: string,
    revision: string,
    signal?: AbortSignal,
  ): Promise<HostResult<DocumentFile>>;
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

/** One comment of a thread: the opening comment or a reply. */
export interface CommentEntry {
  id: string;
  /** The id of the person who wrote it. */
  author: string;
  text: string;
  /** When it was posted: an ISO 8601 date and time. */
  createdAt: string;
}

/** A comment thread on a document, anchored to its text or to a suggestion. */
export interface CommentThread {
  /** The thread's id, which the document's anchor names. The editor chooses it. */
  id: string;
  state: 'open' | 'resolved';
  /** The text the thread was started on. */
  quote: string;
  /** The suggestion the thread discusses, when it does. */
  suggestion: string | null;
  /** The opening comment, then the replies, oldest first. */
  entries: CommentEntry[];
}

/** A thread to start: its id, what it quotes, its opening comment, and its suggestion. */
export interface NewCommentThread {
  id: string;
  quote: string;
  text: string;
  suggestion?: string | null | undefined;
}

/**
 * Where a document's comment threads are kept. The store attributes each comment to the reader
 * and returns the thread as it is after the change.
 */
export interface CommentStoreAdapter {
  list(documentId: string, signal?: AbortSignal): Promise<HostResult<CommentThread[]>>;
  create(documentId: string, thread: NewCommentThread): Promise<HostResult<CommentThread>>;
  reply(documentId: string, threadId: string, text: string): Promise<HostResult<CommentThread>>;
  setState(
    documentId: string,
    threadId: string,
    state: CommentThread['state'],
  ): Promise<HostResult<CommentThread>>;
  remove(documentId: string, threadId: string): Promise<HostResult<null>>;
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
  comments?: CommentStoreAdapter | undefined;
  versions?: VersionStoreAdapter | undefined;
  feedback?: FeedbackAdapter | undefined;
  telemetry?: TelemetryAdapter | undefined;
}
