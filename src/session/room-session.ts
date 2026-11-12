// A room-mode session: the document opened in its shared room through the host's collaboration
// adapter and kept by the room, which every writer edits at once. The session never saves the
// document itself: its status follows the room's, and saving waits for the room to store it.

import type { Schema } from 'prosemirror-model';
import type { HostResult, SavedState } from '../host/adapters.js';
import type { RoomConnection } from '../host/session-adapters.js';
import type { TemplatePin } from '../model/format/template-format.js';
import { createDocumentSchema } from '../model/schema/document-schema.js';
import type {
  DocumentSession,
  DocumentSessionOptions,
  SessionDocument,
} from './document-session.js';
import type { DraftOffer } from './drafts.js';
import { loadPinnedTemplate } from './open-document.js';
import { createRoomDrafts } from './room-drafts.js';
import { type OpenedRoom, openRoom, type RoomDraft, whenKept } from './room-open.js';
import { roomRefusal, roomSavePhase } from './room-status.js';
import { editingModeOf, followSession, withCapabilities } from './session-follow.js';
import {
  changeTemplate,
  createSessionStores,
  defaultState,
  type SessionStores,
} from './store-session.js';
import { createValueStore } from './value-store.js';

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
  const document: SessionDocument = {
    state,
    template: template.value.template,
    pin,
    templateUpdate: null,
    capabilities,
    editingMode: editingModeOf(capabilities, connection.state().access),
  };
  return { ok: true, value: { document, saved: template.value.saved } };
}

// Follows the connection: the session's status from the room's, and the editing mode the room's
// access gives.
function followConnection(connection: RoomConnection, { status, document }: SessionStores) {
  let access = connection.state().access;
  const show = () => {
    const state = connection.state();
    const error = roomRefusal(state);
    const save = error ? 'error' : roomSavePhase(state);
    status.set({ ...status.get(), save, error, dirty: state.hasUnconfirmedChanges });
    if (state.access === access) return;
    access = state.access;
    const shown = document.get();
    if (shown) document.set(withCapabilities(shown, shown.capabilities, access));
  };
  show();
  return connection.subscribe(show);
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
}

// Leaves the room the session is connected to.
function leaveRoom({ drafts, current }: RoomRun) {
  drafts.stop();
  for (const stop of current.stops.splice(0)) stop();
  current.room?.connection.close();
  current.room = null;
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
  document.set(read.value.document);
  current.stops.push(followConnection(room.connection, stores));
  current.stops.push(room.binding.followPin((pin) => void run.showPin(pin)));
  const reopen = (draft: RoomDraft) => {
    leaveRoom(run);
    void loadRoom(run, draft);
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
    connection: () => run.current.room?.connection.state().access ?? 'pending',
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
