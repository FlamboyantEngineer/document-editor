import type { DocumentFile } from '../model/format/document-format.js';
import type { TemplateFile } from '../model/format/template-format.js';
import type { GlossaryEntry } from '../model/glossary.js';
import type { ReferenceBaseline } from '../model/reference-format.js';
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
  /**
   * The stored snapshot of the asset a document names with its id, such as a figure's; defaults to
   * the asset's id.
   */
  snapshotId?: string | undefined;
}

export interface AssetAdapter {
  upload(file: File, signal?: AbortSignal): Promise<HostResult<StoredAsset>>;
  /** URL for an asset id stored in a document. */
  resolveUrl(assetId: string): string;
}

/** Code a URL names, such as a file of a repository with the lines its fragment names. */
export interface ResolvedCode {
  code: string;
  /** Its language, such as `typescript`, when the host knows it. */
  language?: string | undefined;
  /** The number of the source's first line the code holds. Defaults to 1. */
  startLine?: number | undefined;
}

/** Where linked code comes from. */
export interface CodeSourceAdapter {
  /** The code a URL names, such as `https://example.com/repo/main.ts#L10-L20`. */
  resolve(url: string, signal?: AbortSignal): Promise<HostResult<ResolvedCode>>;
}

/** Completes the text a writer is typing, such as through a language model. */
export interface CompletionAdapter {
  /** The text that may follow `before`, ahead of `after`; empty for none. */
  complete(request: {
    before: string;
    after: string;
    signal?: AbortSignal | undefined;
  }): Promise<HostResult<string>>;
}

/** A citation of another document, or of a target in it, that a host found. */
export interface ExternalReference {
  /** The reference type, such as `external-document`. */
  refType: string;
  /** What the citation records of the document cited. */
  baseline: ReferenceBaseline;
  /** How a picker names it. */
  label: string;
}

/** Where references to other documents come from. */
export interface ReferenceSourceAdapter {
  /** The citations whose document or target matches the query. */
  search(query: string, signal?: AbortSignal): Promise<HostResult<ExternalReference[]>>;
}

/** The glossary abbreviations cite. */
export interface GlossaryAdapter {
  /** The entries whose abbreviation or expansion matches the query. */
  search(query: string, signal?: AbortSignal): Promise<HostResult<GlossaryEntry[]>>;
  /** Adds an entry, returning it with the id the host gave it. */
  create(entry: { abbreviation: string; expansion: string }): Promise<HostResult<GlossaryEntry>>;
  /** The entries with these ids as they are now, to refresh a document's abbreviations. */
  resolve(ids: readonly string[]): Promise<HostResult<GlossaryEntry[]>>;
}

/** One comment of a thread: the opening comment or a reply. */
export interface CommentEntry {
  id: string;
  /** The id of the person who wrote it. */
  author: string;
  text: string;
  /** When it was posted: an ISO 8601 date and time. */
  createdAt: string;
  /** When its text was last changed, if it was. */
  editedAt?: string | undefined;
  /** The people who reacted to it, by the emoji they reacted with. */
  reactions?: Record<string, string[]> | undefined;
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
  /** Changes the text of the reader's own comment. */
  edit?(
    documentId: string,
    change: { threadId: string; entryId: string; text: string },
  ): Promise<HostResult<CommentThread>>;
  /** Deletes the reader's own reply. */
  removeEntry?(
    documentId: string,
    entry: { threadId: string; entryId: string },
  ): Promise<HostResult<CommentThread>>;
  /** Adds or takes back the reader's reaction to a comment. */
  react?(
    documentId: string,
    reaction: { threadId: string; entryId: string; emoji: string; reacted: boolean },
  ): Promise<HostResult<CommentThread>>;
  /**
   * Calls `onThreads` with a document's threads whenever they change, by the reader or anyone
   * else, until the returned function is called.
   */
  subscribe?(documentId: string, onThreads: (threads: CommentThread[]) => void): () => void;
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

/** What a proofing issue is about. */
export type ProofingKind = 'spelling' | 'grammar' | 'style';

/** An issue a proofer found in a text, by the offsets of its characters there. */
export interface ProofingIssue {
  /** The offset of the issue's first character in the text checked. */
  readonly from: number;
  /** The offset just past its last character. */
  readonly to: number;
  readonly kind: ProofingKind;
  /** The issue in words, for the reader. */
  readonly message?: string | undefined;
  /** Text to put in place of the issue's, best first. */
  readonly suggestions: readonly string[];
  /** The proofer's rule that found it, which the reader may turn off. */
  readonly rule?: { readonly id: string; readonly description?: string | undefined } | undefined;
  /** The proofer's finer category, such as `punctuation` or `repeated-word`. */
  readonly category?: string | undefined;
}

/** A language a proofer checks, by its BCP 47 tag. */
export interface ProofingLanguage {
  readonly id: string;
  readonly label: string;
}

/** A text to check: a block's text, with each object in it, and code, as spaces. */
export interface ProofingText {
  readonly text: string;
  /** The language to check it in: the block's own, or the document's. */
  readonly language?: string | null | undefined;
}

/**
 * The host's text proofer, such as a spelling and grammar checker. `check` resolves to each text's
 * issues, in the order of the texts; a check that fails, or that the editor aborts because the
 * document changed, marks nothing.
 */
export interface ProoferAdapter {
  check(
    texts: readonly ProofingText[],
    options: { readonly signal: AbortSignal },
  ): Promise<readonly (readonly ProofingIssue[])[]>;
  /** Adds a word to the reader's dictionary, when the proofer keeps one. */
  addWord?: ((word: string) => Promise<void> | void) | undefined;
  /** Turns a rule off for the reader, when the proofer keeps their choice. */
  ignoreRule?: ((ruleId: string) => Promise<void> | void) | undefined;
  /** The languages it checks, which the reader may pick from. */
  languages?: readonly ProofingLanguage[] | undefined;
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
  codeSource?: CodeSourceAdapter | undefined;
  references?: ReferenceSourceAdapter | undefined;
  glossary?: GlossaryAdapter | undefined;
  comments?: CommentStoreAdapter | undefined;
  versions?: VersionStoreAdapter | undefined;
  feedback?: FeedbackAdapter | undefined;
  telemetry?: TelemetryAdapter | undefined;
  proofer?: ProoferAdapter | undefined;
}
