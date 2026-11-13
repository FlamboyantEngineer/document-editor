// A room-mode session: the document opened in its shared room through the host's collaboration
// adapter and kept by the room, which every writer edits at once. The session never saves the
// document itself: its status follows the room's, and saving waits for the room to store it.

import type { Schema } from 'prosemirror-model';
import type { HostResult, SavedState } from '../host/adapters.js';
import { type EditorCapabilities, READ_ONLY_CAPABILITIES } from '../host/capabilities.js';
import type { TemplatePin } from '../model/format/template-format.js';
import { createDocumentSchema } from '../model/schema/document-schema.js';
import type {
  DocumentSession,
  DocumentSessionOptions,
  SessionConnection,
  SessionDocument,
} from './document-session.js';
import type { DraftOffer } from './drafts.js';
import { loadPinnedTemplate } from './open-document.js';
import { createRoomDrafts } from './room-drafts.js';
import { followConnection, readConnection } from './room-follow.js';
import { type OpenedRoom, openRoom, type RoomDraft, whenKept } from './room-open.js';
import { followSession, withCapabilities } from './session-follow.js';
import {
  changeTemplate,
  createSessionStores,
  defaultState,
  type SessionStores,
} from './store-session.js';
import { createValueStore } from './value-store.js';

// Where a room session's connection is before it connects.
const CONNECTING: SessionConnection = {
  phase: 'connecting',
  gate: { editable: false, locked: false },
};

// Room mode opens on its draft by itself, so it offers none to restore.
const NO_DRAFT_OFFER: Pick<DocumentSession, 'draft' | 'restoreDraft' | 'discardDraft'> = {
  draft: createValueStore<DraftOffer | null>(null),
  restoreDraft: () => Promise.resolve(false),
  discardDraft: () => undefined,
};

// The document the room holds, read for the editor with the room's plugins.
async function readRoom(
  room: OpenedRoom,
  options: DocumentSessionOptions & { schema: Schema; stores: SessionStores; signal: AbortSignal },
): Promise<HostResult<{ document: SessionDocument; saved: SavedState | null }>> {
  const { binding, connection, capabilities } = room;
  const pin = binding.pin();
  const template = await loadPinnedTemplate(options.host, pin, options.signal);
  if (!template.ok) return template;
  options.stores.setLoaded(template.value.template);
  const doc = binding.content() ?? options.schema.topNodeType.createAndFill();
  if (!doc) throw new Error('The schema cannot make an empty document.');
  const create = options.createState ?? defaultState(options.schema);
  const state = create(doc, { ...options.stores.context, room: { plugins: binding.plugins } });
  const shown = { state, template: template.value.template, pin, templateUpdate: null };
  const cached = room.draft !== null;
  const { gate } = readConnection(connection, { cached, hasSynced: !cached });
  const document: SessionDocument = withCapabilities(
    { ...shown, capabilities, editingMode: 'read' },
    capabilities,
    gate,
  );
  return { ok: true, value: { document, saved: template.value.saved } };
}

// What a room session runs on: its stores, its drafts and the room it is connected to now.
interface RoomRun {
  options: DocumentSessionOptions & { schema: Schema };
  signal: AbortSignal;
  stores: SessionStores;
  drafts: ReturnType<typeof createRoomDrafts>;
  follow: ReturnType<typeof followSession>;
  showPin: (pin: TemplatePin | null) => Promise<boolean>;
  current: { room: OpenedRoom | null; stops: (() => void)[] };
  /** The capabilities the host grants the reader, before the connection's gate narrows them. */
  granted: EditorCapabilities;
}

// Leaves the room the session is connected to. The session holds no room by the time the
// connection closes, so a connection that fails to close leaves nothing half left.
function leaveRoom({ drafts, current }: RoomRun) {
  drafts.stop();
  for (const stop of current.stops.splice(0)) stop();
  const { room } = current;
  current.room = null;
  room?.connection.close();
}

// Opens the room; on a draft of an older generation, again without it, merging it in
// (DOCE-SESSION-6.10).
async function loadRoom(run: RoomRun, merged: RoomDraft | null = null): Promise<boolean> {
  const { options, signal, stores, current } = run;
  const { host, documentId, schema } = options;
  const { status, document } = stores;
  const syncing = () => status.set({ ...status.get(), load: 'syncing' });
  const skipDraft = merged !== null;
  const opened = await openRoom(host, { documentId, schema, signal, skipDraft }, syncing);
  const read = opened.ok ? await readRoom(opened.value, { ...options, stores, signal }) : opened;
  if (signal.aborted || !opened.ok || !read.ok) {
    if (opened.ok) opened.value.connection.close();
    if (!signal.aborted) {
      status.set({ ...status.get(), load: 'failed', error: read.ok ? null : read.error });
    }
    return false;
  }
  const room = opened.value;
  current.room = room;
  run.granted = room.capabilities;
  document.set(read.value.document);
  const following = { cached: room.draft !== null, granted: () => run.granted };
  current.stops.push(followConnection(room.connection, stores, following));
  current.stops.push(room.binding.followPin((pin) => void run.showPin(pin)));
  // The session may have closed, or left this room, by the time the refused draft was read. A
  // connection that fails to close does not keep the room from opening again.
  const reopen = (draft: RoomDraft) => {
    if (signal.aborted || current.room !== room) return;
    try {
      leaveRoom(run);
    } finally {
      void loadRoom(run, draft);
    }
  };
  current.stops.push(run.drafts.follow(room, reopen));
  run.follow.followTemplate(read.value.document.pin, read.value.saved);
  await run.drafts.start(room, merged);
  status.set({ ...status.get(), load: 'ready' });
  return true;
}

/** Opens a document in its shared room (DOCE-SESSION-3.2 to 3.6). */
export function createRoomSession(options: DocumentSessionOptions): DocumentSession {
  const { host, documentId } = options;
  const schema = options.schema ?? createDocumentSchema();
  const controller = new AbortController();
  const { signal } = controller;
  const stores = createSessionStores(options, 'connecting');
  stores.connection.set(CONNECTING);
  const { status, document } = stores;
  const flush = () => {
    const opened = run.current.room;
    return opened ? whenKept(opened.connection) : Promise.resolve(true);
  };
  const follow = followSession({
    host,
    documentId,
    document,
    onLeave: () => void flush(),
    gate: () => stores.connection.get()?.gate ?? null,
    onGranted: (capabilities) => {
      run.granted = capabilities;
    },
  });
  const showPin = async (pin: TemplatePin | null) => {
    const changed = await changeTemplate({ host, signal }, stores, pin);
    if (changed) follow.followTemplate(pin, changed.saved);
    return changed !== null;
  };

  const run: RoomRun = {
    options: { ...options, schema },
    signal,
    stores,
    drafts: createRoomDrafts({ host, documentId, schema, stores }),
    follow,
    showPin,
    current: { room: null, stops: [] },
    granted: READ_ONLY_CAPABILITIES,
  };
  const room = () => run.current.room;
  const close = () => {
    controller.abort();
    follow.stop();
    run.drafts.close();
    leaveRoom(run);
  };
  options.signal?.addEventListener('abort', close, { once: true });

  return {
    documentId,
    mode: 'room',
    status,
    document,
    // A shared room merges every writer's changes itself; what is left to settle are a draft's
    // blocks a new generation of the room changed too (DOCE-SESSION-6.10).
    conflicts: stores.conflicts,
    connection: stores.connection,
    ready: loadRoom(run),
    update: (update) => {
      const shown = document.get();
      if (!shown) return;
      const state = typeof update === 'function' ? update(shown.state) : update;
      if (state !== shown.state) document.set({ ...shown, state });
    },
    setTemplate: async (pin) => {
      const opened = room();
      if (!opened || document.get()?.editingMode !== 'edit') return false;
      const shown = await showPin(pin);
      if (shown) opened.binding.setPin(pin);
      return shown;
    },
    save: async () => {
      await flush();
    },
    flush,
    hasUnsavedChanges: () => room()?.connection.state().hasUnconfirmedChanges ?? false,
    ...NO_DRAFT_OFFER,
    resolveConflict: (id, choice) => run.drafts.resolve(room(), id, choice),
    close,
  };
}
