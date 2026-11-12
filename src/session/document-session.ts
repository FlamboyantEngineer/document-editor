// A document session: one document, opened by id through the host, edited, and kept, with its
// status. It needs no framework; `useDocumentSession` gives it to React.

import type { Node as ProseMirrorNode, Schema } from 'prosemirror-model';
import type { EditorState, Plugin } from 'prosemirror-state';
import type { EditorHost, SavedState } from '../host/adapters.js';
import type { EditingMode, EditorCapabilities } from '../host/capabilities.js';
import type { TemplateFile, TemplatePin } from '../model/format/template-format.js';
import type { DraftOffer } from './drafts.js';
import type { MergeConflict } from './merge.js';
import type { MergeChoice } from './merge-conflicts.js';
import { createRoomSession } from './room-session.js';
import type { SessionStatusStore } from './status.js';
import { createStoreSession } from './store-session.js';
import type { ValueStore } from './value-store.js';

/**
 * How a session keeps its document: through the host's document store, or in the document's
 * shared room (`host.collaboration`), where every writer edits the same document at once.
 */
export type SessionMode = 'store' | 'room';

/** A new editor state, or an update of the current one, as the editor commits them. */
export type SessionStateUpdate = EditorState | ((state: EditorState) => EditorState);

/** What a session's editor state is made with. */
export interface SessionStateContext {
  /** The document's resolved template as it is now. */
  template: () => TemplateFile;
  /** The reader, whom new elements are attributed to. */
  author: () => string | null;
  /**
   * In room mode, the plugins that keep the state and the room the same. The state runs them after
   * its own, with no undo history of its own: the room's binding keeps the reader's undo.
   */
  room?: { readonly plugins: readonly Plugin[] } | undefined;
}

export interface DocumentSessionOptions {
  host: EditorHost;
  documentId: string;
  mode: SessionMode;
  /** The schema documents are read with. Defaults to `createDocumentSchema()`. */
  schema?: Schema | undefined;
  /**
   * Makes the editor state for a loaded document. Defaults to the document's editing plugins
   * (`createDocumentEditing`); in room mode it must run the context's `room` plugins.
   */
  createState?: ((doc: ProseMirrorNode, context: SessionStateContext) => EditorState) | undefined;
  /** How long after the last change store mode saves, in milliseconds. Defaults to 1000. */
  autosaveDelay?: number | undefined;
  /**
   * How long after the last change the unsaved content is kept as a draft through the host's
   * `drafts` adapter, in milliseconds. Defaults to 300.
   */
  draftDelay?: number | undefined;
  /** Closes the session, aborting what it is loading. */
  signal?: AbortSignal | undefined;
}

/** The document a session shows, once loaded. */
export interface SessionDocument {
  readonly state: EditorState;
  /** The document's template, resolved, at the revision the document pins. */
  readonly template: TemplateFile;
  /** The template the document pins, or null for the base template. */
  readonly pin: TemplatePin | null;
  /**
   * The latest saved state of the pinned template when it is newer than the pinned revision, so
   * the reader may move the document to it; null otherwise.
   */
  readonly templateUpdate: SavedState | null;
  readonly capabilities: EditorCapabilities;
  readonly editingMode: EditingMode;
}

/** One open document. */
export interface DocumentSession {
  readonly documentId: string;
  readonly mode: SessionMode;
  readonly status: SessionStatusStore;
  /** The document, its template and the reader's capabilities; null until loaded. */
  readonly document: ValueStore<SessionDocument | null>;
  /** Resolves true once the document is loaded, or false when loading failed or was aborted. */
  readonly ready: Promise<boolean>;
  /**
   * A draft kept from an earlier visit with content the store does not hold, offered once the
   * document loads until it is restored or discarded; null for none (DOCE-SESSION-6).
   */
  readonly draft: ValueStore<DraftOffer | null>;
  /**
   * Shows the offered draft in place of the stored content, as a change to save against the
   * revision it was edited from; resolves false when there is none or it cannot be read.
   */
  restoreDraft(): Promise<boolean>;
  /** Removes the offered draft, keeping the stored content. */
  discardDraft(): void;
  /**
   * The blocks both the reader and another writer changed, which wait for the reader to settle
   * them before the document saves again; empty when there are none.
   */
  readonly conflicts: ValueStore<readonly MergeConflict[]>;
  /** Commits an editor state: the editor's `onStateChange`. */
  update(update: SessionStateUpdate): void;
  /** Pins another template, or another revision of it, which is then a change to save. */
  setTemplate(pin: TemplatePin | null): Promise<boolean>;
  /** Settles one of `conflicts` by the reader's choice, by its block's element id. */
  resolveConflict(id: string, choice: MergeChoice): Promise<void>;
  /** Keeps the document's changes now, and resolves once they are kept or failed. */
  save(): Promise<void>;
  /**
   * Keeps what is unsaved as an automatic save does, before the page goes away; resolves true
   * once nothing is left unsaved.
   */
  flush(): Promise<boolean>;
  /** Whether the document has changes that are not kept yet, for an unsaved-changes guard. */
  hasUnsavedChanges(): boolean;
  /** Stops following the host and stops saving. */
  close(): void;
}

/** Opens a document by id in the mode given (DOCE-SESSION-3). */
export function createDocumentSession(options: DocumentSessionOptions): DocumentSession {
  return options.mode === 'room' ? createRoomSession(options) : createStoreSession(options);
}
