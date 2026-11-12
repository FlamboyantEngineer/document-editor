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
import { loadPinnedTemplate } from './open-document.js';
import { type OpenedRoom, openRoom, whenKept } from './room-open.js';
import { roomRefusal, roomSavePhase } from './room-status.js';
import { editingModeOf, followSession, withCapabilities } from './session-follow.js';
import {
  changeTemplate,
  createSessionStores,
  defaultState,
  type SessionStores,
} from './store-session.js';

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

/** Opens a document in its shared room (DOCE-SESSION-3.2 to 3.6). */
export function createRoomSession(options: DocumentSessionOptions): DocumentSession {
  const { host, documentId } = options;
  const schema = options.schema ?? createDocumentSchema();
  const controller = new AbortController();
  const { signal } = controller;
  const stores = createSessionStores(options, 'connecting');
  const { status, document } = stores;
  let room: OpenedRoom | null = null;
  const stops: (() => void)[] = [];
  const flush = () => (room ? whenKept(room.connection) : Promise.resolve(true));
  const follow = followSession({
    host,
    documentId,
    document,
    onLeave: () => void flush(),
    connection: () => room?.connection.state().access ?? 'pending',
  });
  const showPin = async (pin: TemplatePin | null) => {
    const changed = await changeTemplate({ host, signal }, stores, pin);
    if (changed) follow.followTemplate(pin, changed.saved);
    return changed !== null;
  };

  const load = async () => {
    const syncing = () => status.set({ ...status.get(), load: 'syncing' });
    const opened = await openRoom(host, { documentId, schema, signal }, syncing);
    const read = opened.ok
      ? await readRoom(opened.value, { ...options, schema, stores, signal })
      : opened;
    if (signal.aborted) {
      if (opened.ok) opened.value.connection.close();
      return false;
    }
    if (!opened.ok || !read.ok) {
      if (opened.ok) opened.value.connection.close();
      status.set({ ...status.get(), load: 'failed', error: read.ok ? null : read.error });
      return false;
    }
    room = opened.value;
    document.set(read.value.document);
    stops.push(followConnection(room.connection, stores));
    stops.push(room.binding.followPin((pin) => void showPin(pin)));
    follow.followTemplate(read.value.document.pin, read.value.saved);
    status.set({ ...status.get(), load: 'ready' });
    return true;
  };

  const close = () => {
    controller.abort();
    follow.stop();
    for (const stop of stops.splice(0)) stop();
    room?.connection.close();
  };
  options.signal?.addEventListener('abort', close, { once: true });

  return {
    documentId,
    mode: 'room',
    status,
    document,
    // A shared room merges every writer's changes itself: nothing is left to settle.
    conflicts: stores.conflicts,
    ready: load(),
    update: (update) => {
      const shown = document.get();
      if (!shown) return;
      const state = typeof update === 'function' ? update(shown.state) : update;
      if (state !== shown.state) document.set({ ...shown, state });
    },
    setTemplate: async (pin) => {
      if (!room || document.get()?.editingMode !== 'edit') return false;
      const shown = await showPin(pin);
      if (shown) room.binding.setPin(pin);
      return shown;
    },
    save: async () => {
      await flush();
    },
    flush,
    resolveConflict: () => Promise.resolve(),
    hasUnsavedChanges: () => room?.connection.state().hasUnconfirmedChanges ?? false,
    close,
  };
}
