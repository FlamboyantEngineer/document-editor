import type { DocumentFile, StoredContent } from '../model/format/document-format.js';
import type { TemplateFile, TemplatePin } from '../model/format/template-format.js';
import type { GlossaryEntry } from '../model/glossary.js';
import type { ReferenceBaseline } from '../model/reference-format.js';
import type { AssetAdapter, DiagramAdapter } from './asset-adapters.js';
import type { EditorCapabilities } from './capabilities.js';
import type { CommentStoreAdapter } from './comment-adapters.js';
import type { ExportsAdapter } from './export-adapters.js';
import type { ProoferAdapter } from './proofing-adapters.js';
import type { CollaborationAdapter, DraftsAdapter, LifecycleAdapter } from './session-adapters.js';

export type * from './asset-adapters.js';
export type * from './export-adapters.js';

/** A failure the host reports for a request it could not complete. */
export interface HostError {
  kind: 'not-found' | 'denied' | 'conflict' | 'unavailable';
  /** Text the editor may show the reader. */
  message?: string | undefined;
  /**
   * For a document save refused as `conflict`, the document as it is stored now, which the editor
   * merges its changes into. Without it, the editor loads the document again.
   */
  current?: StoredDocument | undefined;
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
  /**
   * Calls `onCapabilities` with what the reader may do whenever that changes, such as when their
   * role changes, until the returned function is called.
   */
  subscribe?(
    documentId: string,
    onCapabilities: (capabilities: EditorCapabilities) => void,
  ): () => void;
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
  /**
   * Calls `onSaved` with a document's saved state whenever it is saved, by the reader or anyone
   * else, until the returned function is called. The editor loads the content it lacks.
   */
  subscribe?(documentId: string, onSaved: (state: SavedState) => void): () => void;
}

/** A saved version of a document. */
export interface DocumentVersion extends SavedState {
  /** When it was saved: an ISO 8601 date and time. */
  savedAt: string;
  /** The id of the person who saved it, when the host knows. */
  author: string | null;
  /** The version's name; null for a version saved automatically. */
  label: string | null;
  /**
   * The template the version pins (its content's `template`), when the host lists it; null for the
   * base template.
   */
  template?: TemplatePin | null | undefined;
  /** How many comment threads the document had when the version was saved, when the host keeps them. */
  threads?: number | undefined;
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
  /** Saves `content` as a new version, named by `label` or null, and returns it. */
  create?(
    documentId: string,
    version: { content: DocumentFile; label: string | null },
  ): Promise<HostResult<DocumentVersion>>;
  /** Names a version, or takes its name away with null, and returns it. */
  rename?(
    documentId: string,
    revision: string,
    label: string | null,
  ): Promise<HostResult<DocumentVersion>>;
  /**
   * Makes a version's content the document's current content, as a new saved state, which it
   * returns. Without it, the editor restores a version by editing the document to its content.
   */
  restore?(documentId: string, revision: string): Promise<HostResult<SavedState>>;
  /** Calls `onChange` whenever the document's versions change, until the returned function is called. */
  subscribe?(documentId: string, onChange: () => void): () => void;
}

/** A stored template, in the stored format, before the chain it inherits is resolved. */
export interface StoredTemplate extends SavedState {
  template: TemplateFile;
}

/** Which revision of a stored template to load. */
export interface TemplateLoadOptions {
  /** The revision a document pins (`DocumentFile.template.revision`); without one, the latest. */
  revision?: string | undefined;
  signal?: AbortSignal | undefined;
}

export interface TemplateSourceAdapter {
  load(templateId: string, options?: TemplateLoadOptions): Promise<HostResult<StoredTemplate>>;
  /**
   * Calls `onSaved` with a template's latest saved state whenever it is saved, until the returned
   * function is called.
   */
  subscribe?(templateId: string, onSaved: (state: SavedState) => void): () => void;
}

/** Font faces the host serves itself, which a template's text styles name by family. */
export interface FontsAdapter {
  /**
   * Loads the faces of the font families a document's template names. Resolves once they loaded or
   * failed, or `timeout` milliseconds passed, with the families that loaded.
   */
  load(
    families: readonly string[],
    options: { timeout: number; signal?: AbortSignal | undefined },
  ): Promise<HostResult<readonly string[]>>;
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

/** A name a script can use: an object, a function, a property, or a snippet it inserts. */
export interface ScriptVocabularyEntry {
  /** The name as written, such as `render.paragraph`; a member's name follows its object's. */
  readonly name: string;
  readonly kind?: 'object' | 'function' | 'property' | 'snippet' | 'keyword' | undefined;
  /** How it is called, such as `render.paragraph(text)`. */
  readonly signature?: string | undefined;
  /** One line on what it is. */
  readonly description?: string | undefined;
  /** More on it, shown beside the completions and in the reference. */
  readonly documentation?: string | undefined;
  /** The text a completion inserts in place of the name, such as a snippet's body. */
  readonly insertText?: string | undefined;
}

/** A problem a check found in a script, by its line and column from 1. */
export interface ScriptDiagnostic {
  readonly message: string;
  readonly line?: number | undefined;
  readonly column?: number | undefined;
  readonly severity?: 'error' | 'warning' | undefined;
}

/** Runs a document's scripts, producing the content each script block shows. */
export interface ScriptRunnerAdapter {
  /** The content a script produces, run against the document as it is. */
  run(
    request: { blockId: string; source: string; document: DocumentFile },
    signal?: AbortSignal,
  ): Promise<HostResult<StoredContent>>;
  /** The names a script can use, which the script editor completes and documents. */
  readonly vocabulary?: readonly ScriptVocabularyEntry[] | undefined;
  /** Checks a script without running it; an error keeps it from being applied. */
  check?(source: string, signal?: AbortSignal): Promise<HostResult<readonly ScriptDiagnostic[]>>;
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
  /**
   * Each citation, by the document and target it names, as the host has it now, in the order
   * given; null for one whose document or target is gone, and `no-access` for one the reader may
   * not read.
   */
  resolve?(
    citations: readonly { documentId: string; targetId: string | null }[],
    signal?: AbortSignal,
  ): Promise<HostResult<(ReferenceBaseline | null | 'no-access')[]>>;
  /**
   * The address a printed citation links to, such as the cited document in the host; null leaves
   * it unlinked. Called while a snapshot is made, so it answers at once.
   */
  href?(citation: { refType: string; baseline: ReferenceBaseline }): string | null;
}

/** What an embed shows: content the host keeps elsewhere, by its kind and the host's id for it. */
export interface EmbedSource {
  /** The host's kind of content, such as `data-set`. */
  kind: string;
  /** The host's id of the content within its kind. */
  source: string;
}

/** An embedded content's state as the host has it now: the state's id and the content's name. */
export interface EmbedSnapshot {
  /** The host's id of this state of the content, such as a revision. */
  snapshot: string;
  /** How the editor names the content. */
  label: string;
}

/** An embedded content's state, with what it holds as stored content. */
export interface EmbedContent extends EmbedSnapshot {
  content: StoredContent;
}

/** Where embedded content comes from: content the host keeps, shown in the document locked. */
export interface EmbedSourceAdapter {
  /** The kinds of content the host embeds; an embed of another kind is pasted as its content. */
  readonly kinds: readonly string[];
  /**
   * Each embed's content state as the host has it now, in the order given; null for content that
   * is gone, and `no-access` for content the reader may not read.
   */
  resolve(
    embeds: readonly EmbedSource[],
    signal?: AbortSignal,
  ): Promise<HostResult<(EmbedSnapshot | null | 'no-access')[]>>;
  /** An embed's content as it is now. */
  load(embed: EmbedSource, signal?: AbortSignal): Promise<HostResult<EmbedContent>>;
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

export type FeedbackTone = 'info' | 'success' | 'warning' | 'error';

export interface FeedbackAdapter {
  /** Shows the reader a transient message, such as a failed save. */
  notify(message: { tone: FeedbackTone; text: string }): void;
}

export interface TelemetryAdapter {
  /** Records a named duration, such as the time from mount to first paint. */
  measure(name: string, durationMs: number, attributes?: Readonly<Record<string, string>>): void;
  /** Records a named count, such as the blocks a layout measured. */
  count?:
    | ((name: string, value: number, attributes?: Readonly<Record<string, string>>) => void)
    | undefined;
}

/**
 * The values of the variables the host knows, such as `document.name`, for the editor to show in
 * page headers and footers and in the text. The editor gives `page.current`, `page.total` and
 * `date.current` itself.
 */
export interface VariablesAdapter {
  /** A variable's text; null or undefined shows none. */
  value(key: string): string | null | undefined;
  /** Calls `onChange` whenever a value may have changed, until the returned function is called. */
  subscribe?(onChange: () => void): () => void;
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
  diagrams?: DiagramAdapter | undefined;
  fonts?: FontsAdapter | undefined;
  codeSource?: CodeSourceAdapter | undefined;
  references?: ReferenceSourceAdapter | undefined;
  embeds?: EmbedSourceAdapter | undefined;
  glossary?: GlossaryAdapter | undefined;
  scripts?: ScriptRunnerAdapter | undefined;
  comments?: CommentStoreAdapter | undefined;
  versions?: VersionStoreAdapter | undefined;
  feedback?: FeedbackAdapter | undefined;
  exports?: ExportsAdapter | undefined;
  telemetry?: TelemetryAdapter | undefined;
  proofer?: ProoferAdapter | undefined;
  variables?: VariablesAdapter | undefined;
  drafts?: DraftsAdapter | undefined;
  collaboration?: CollaborationAdapter | undefined;
  lifecycle?: LifecycleAdapter | undefined;
}
