// Room mode offline: the shared document's state, the changes the room has not confirmed and the
// last state it confirmed all of, kept through the host's drafts adapter so the editor opens and
// edits with no connection and sends what it kept once connected again (D25).

import * as Y from '@y/y';
import type {
  DocumentDraft,
  DraftsAdapter,
  LifecycleAdapter,
  RoomConnection,
} from '../host/session-adapters.js';

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
