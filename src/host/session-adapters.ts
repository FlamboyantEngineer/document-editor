// The adapters a document session reaches beyond the document store: drafts kept through reloads,
// shared rooms for room mode, and the page's lifecycle.

import type { DocumentFile } from '../model/format/document-format.js';
import type { HostResult } from './adapters.js';

/**
 * Unsaved work the editor keeps for a document so a reload or a crash does not lose it: in store
 * mode, the content not yet saved and the revision it was edited from; in room mode, the shared
 * document's state and the changes the room has not confirmed, for the room's generation.
 */
export type DocumentDraft =
  | {
      mode: 'store';
      content: DocumentFile;
      baseRevision: string;
      /** When it was kept: an ISO 8601 date and time. */
      savedAt: string;
    }
  | {
      mode: 'room';
      /** The room generation the state belongs to, or null when the room named none. */
      generation: string | null;
      /** The shared document's state, encoded as one update. */
      state: Uint8Array;
      /** The local changes the room had not confirmed, encoded as one update, or null for none. */
      unconfirmed: Uint8Array | null;
      savedAt: string;
    };

/**
 * Where the editor keeps drafts, such as the browser's indexed storage, which the editor never
 * touches itself. A document has at most one draft per mode.
 */
export interface DraftsAdapter {
  get(documentId: string, mode: DocumentDraft['mode']): Promise<HostResult<DocumentDraft | null>>;
  /** Keeps a draft, in place of the document's earlier draft in the same mode. */
  put(documentId: string, draft: DocumentDraft): Promise<HostResult<null>>;
  clear(documentId: string, mode: DocumentDraft['mode']): Promise<HostResult<null>>;
}

/**
 * A room connection's state, shaped like a collaboration-tools provider's, so a host can pass that
 * provider's state as it is.
 */
export interface RoomState {
  status: 'connecting' | 'connected' | 'disconnected';
  /** `pending` until the room grants access on the current connection. */
  access: 'pending' | 'read-write' | 'read-only';
  /** Whether the current connection has completed its first sync. */
  synced: boolean;
  /** Whether the room has not yet confirmed some local change. */
  hasUnconfirmedChanges: boolean;
  /** The room's reason for refusing the connection, or null. */
  refusal: string | null;
  /** The room's generation, when it refused the document for holding another one, or null. */
  roomGeneration: string | null;
  /** Whether the room has stored its changes, as it last said, or null before it said. */
  saveStatus: 'saved' | 'unsaved' | 'saving' | 'retrying' | null;
}

/**
 * A document's shared room, connected. `Doc` is a Y.Doc of `@y/y` and `Awareness` its awareness;
 * the library's `./collab` entry names them, so the host contract never loads the realtime library.
 */
export interface RoomConnection<Doc = unknown, Awareness = unknown> {
  readonly doc: Doc;
  readonly awareness: Awareness;
  state(): RoomState;
  /** Calls `onState` whenever the state changes, until the returned function is called. */
  subscribe(onState: (state: RoomState) => void): () => void;
  /** Resolves once the connection first completes its sync, or rejects when it is refused. */
  readonly whenSynced: Promise<void>;
  /**
   * Resolves true once the room has stored every local change made so far, or false when the
   * connection is refused or closed first.
   */
  whenStored(): Promise<boolean>;
  /** Whether a change with this origin came from the room rather than from this editor. */
  isRemoteOrigin(origin: unknown): boolean;
  /** The local changes the room has not confirmed, encoded as one update, or null for none. */
  unconfirmedUpdate(): Uint8Array | null;
  /** Ends the connection and frees what it holds. */
  close(): void;
}

/** What a room connection starts from: a draft's state and unconfirmed changes. */
export interface RoomConnectOptions {
  signal?: AbortSignal | undefined;
  /**
   * A room-mode draft (DraftsAdapter) to start from: the host applies its state to the new
   * document and hands its unconfirmed changes to the connection to send again.
   */
  draft?: Extract<DocumentDraft, { mode: 'room' }> | undefined;
}

/** Connects documents to their shared rooms, for room mode. */
export interface CollaborationAdapter<Doc = unknown, Awareness = unknown> {
  connect(
    documentId: string,
    options?: RoomConnectOptions,
  ): Promise<HostResult<RoomConnection<Doc, Awareness>>>;
}

/** A change in the page's lifecycle that the editor saves or pauses on. */
export type LifecycleEvent = 'hidden' | 'visible' | 'leaving';

/** The page's lifecycle, such as the document's visibility and its `pagehide` event. */
export interface LifecycleAdapter {
  /** Calls `onEvent` with each lifecycle change, until the returned function is called. */
  subscribe(onEvent: (event: LifecycleEvent) => void): () => void;
}
