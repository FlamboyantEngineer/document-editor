// Room mode offline: the shared document's state, the changes the room has not confirmed and the
// last state it confirmed all of, kept through the host's drafts adapter so the editor opens and
// edits with no connection and sends what it kept once connected again (D25).

import * as Y from '@y/y';
import type { EditorState, Transaction } from 'prosemirror-state';
import { createElementId } from '../engine/element-ids.js';
import { replaceDocumentContent } from '../engine/replace-document-content.js';
import type {
  DocumentDraft,
  DraftsAdapter,
  LifecycleAdapter,
  RoomConnection,
} from '../host/session-adapters.js';
import type { DocumentFile } from '../model/format/document-format.js';
import { readDocumentFile } from '../model/format/document-format-convert.js';
import { writeDocumentFile } from '../model/format/document-format-write.js';
import { type MergeConflict, mergeDocuments } from '../session/merge.js';
import { resolveMergeConflict } from '../session/merge-conflicts.js';
import { readRoomDocument, type RoomReadOptions, yjsToDocument } from './convert.js';

/** A room-mode draft as the adapter keeps it. */
export type RoomDraft = Extract<DocumentDraft, { mode: 'room' }>;

// Where a collaboration-tools room keeps its own metadata, the room's generation among it
// (docs/collaboration.md).
const ROOM_META_TYPE = '__room';
const GENERATION_KEY = 'generation';

/** The generation of the room a shared document was synced from, or null for none. */
export function readRoomGeneration(doc: Y.Doc): string | null {
  const value: unknown = doc.get(ROOM_META_TYPE).getAttr(GENERATION_KEY);
  return typeof value === 'string' && value !== '' ? value : null;
}

/** Whether Yjs holds updates it could not integrate yet (DOCE-COLLAB-4.6). */
function hasPending(doc: Y.Doc): boolean {
  const store = doc.store as unknown as { pendingStructs: unknown; pendingDs: unknown };
  return store.pendingStructs !== null || store.pendingDs !== null;
}

/**
 * Applies a draft's cached state to a new shared document, before the connection starts: one
 * complete update, so Yjs integrates it whole, then checked for anything it left pending (the Yjs
 * pending behaviour, DOCE-COLLAB-4.6). The draft's unconfirmed changes are already in its state;
 * hand them to the connection (`unconfirmedUpdate`) so it sends them again. Returns false when the
 * state could not be integrated whole.
 */
export function restoreRoomDraft(doc: Y.Doc, draft: RoomDraft, origin?: unknown): boolean {
  const updates = [draft.state, draft.unconfirmed ?? new Uint8Array()].filter(
    (update) => update.length > 0,
  ) as Uint8Array<ArrayBuffer>[];
  // Merged, the updates are one complete update in causal order, whatever order they hold.
  Y.applyUpdate(doc, Y.mergeUpdates(updates), origin);
  if (hasPending(doc)) Y.applyUpdate(doc, Y.encodeStateAsUpdate(doc), origin);
  return !hasPending(doc);
}

/** What keeps a room document's drafts. */
export interface RoomDraftsOptions {
  documentId: string;
  drafts: DraftsAdapter;
  connection: RoomConnection<Y.Doc>;
  /** Keeps the draft at once when the page is hidden or left. */
  lifecycle?: LifecycleAdapter | undefined;
  /** The draft the document was restored from, whose confirmed state stands until a newer one. */
  restored?: RoomDraft | null | undefined;
  /** How long after the last change the draft is kept, in milliseconds. Defaults to 1000. */
  delay?: number | undefined;
  now?: (() => Date) | undefined;
}

/** Keeps a room document's draft until stopped. */
export interface RoomDrafts {
  /** Keeps the draft now, and resolves once the adapter has it. */
  flush(): Promise<void>;
  stop(): void;
}

const DEFAULT_DELAY = 1000;

/**
 * Keeps a room document's draft through the drafts adapter after each change, local or remote, and
 * whenever the room confirms the local changes: the state, the unconfirmed changes and the last
 * state the room confirmed all of, for the room's generation (DOCE-SESSION-6.7).
 */
export function keepRoomDrafts(options: RoomDraftsOptions): RoomDrafts {
  const { documentId, drafts, connection } = options;
  const { doc } = connection;
  const now = options.now ?? (() => new Date());
  const delay = options.delay ?? DEFAULT_DELAY;
  let confirmed: Uint8Array | null = options.restored?.confirmed ?? null;
  let unconfirmedBefore = connection.state().hasUnconfirmedChanges;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const keep = () => {
    cancel();
    if (stopped) return Promise.resolve();
    const state = Y.encodeStateAsUpdate(doc);
    const unconfirmed = connection.unconfirmedUpdate();
    if (!unconfirmed && !connection.state().hasUnconfirmedChanges) confirmed = state;
    const draft: RoomDraft = {
      mode: 'room',
      generation: readRoomGeneration(doc),
      state,
      unconfirmed,
      confirmed,
      savedAt: now().toISOString(),
    };
    return drafts.put(documentId, draft).then(() => undefined);
  };
  const schedule = () => {
    if (stopped) return;
    cancel();
    timer = setTimeout(() => void keep(), delay);
  };

  const onUpdate = () => schedule();
  doc.on('update', onUpdate);
  const stopState = connection.subscribe((state) => {
    // The room confirmed every local change: what the document holds now is the base to keep.
    if (unconfirmedBefore && !state.hasUnconfirmedChanges) schedule();
    unconfirmedBefore = state.hasUnconfirmedChanges;
  });
  const stopLifecycle = options.lifecycle?.subscribe((event) => {
    if (event === 'hidden' || event === 'leaving') void keep();
  });

  return {
    flush: keep,
    stop: () => {
      stopped = true;
      cancel();
      doc.off('update', onUpdate);
      stopState();
      stopLifecycle?.();
    },
  };
}

/** What a room draft's merge into a new generation's document gives. */
export interface RoomDraftMerge {
  /** The change that takes the draft's offline edits into the document, or null for none. */
  transaction: Transaction | null;
  /**
   * The draft's blocks that could not be placed: blocks the new generation changed or removed too.
   * The document keeps the new generation's version; `mine` is the draft's, to report.
   */
  leftovers: readonly MergeConflict[];
}

const EMPTY_DOCUMENT: DocumentFile = { formatVersion: 1, sections: [] };

/**
 * Merges what a room draft holds beyond the last state the room confirmed into the document of a
 * room that started a new generation (DOCE-SESSION-6.9): a three-way merge by element id
 * (`mergeDocuments`) with the confirmed state as the base, the draft as mine and the new document
 * as theirs. A draft with no confirmed state merges from an empty base, so every block that differs
 * is a leftover. Blocks both changed keep the new generation's version and are reported.
 */
export function mergeRoomDraft(
  state: EditorState,
  draft: RoomDraft,
  options: RoomReadOptions,
): RoomDraftMerge {
  const cached = restoredDoc(draft);
  const mine = readRoomDocument(cached, options);
  cached.destroy();
  if (!draft.unconfirmed || !mine) return { transaction: null, leftovers: [] };
  const base = draft.confirmed ? yjsToDocument(draft.confirmed, options) : null;
  const theirs = writeDocumentFile(state.doc, { fragmentRules: options.fragmentRules });
  const merge = mergeDocuments({ base: base ?? EMPTY_DOCUMENT, mine, theirs });
  const content = merge.conflicts.reduce(
    (merged, conflict) =>
      resolveMergeConflict(merged, conflict, { choice: 'theirs', newId: createElementId }),
    merge.content,
  );
  const read = readDocumentFile(content, options.schema, { unknown: 'keep' });
  const transaction = replaceDocumentContent(state, read.doc);
  return { transaction: transaction.docChanged ? transaction : null, leftovers: merge.conflicts };
}

// A shared document holding a draft's state and unconfirmed changes.
function restoredDoc(draft: RoomDraft): Y.Doc {
  const doc = new Y.Doc();
  restoreRoomDraft(doc, draft);
  return doc;
}
