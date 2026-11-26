// A room-mode session: the document opened in its shared room through the host's collaboration
// adapter and kept by the room, which every writer edits at once. The session never saves the
// document itself: its status follows the room's, and saving waits for the room to store it.

import type { Schema } from 'prosemirror-model';
import { movedDocument } from '../engine/template-move.js';
import type { HostResult, SavedState } from '../host/adapters.js';
import type { TemplatePin } from '../model/format/template-format.js';
import { createDocumentSchema } from '../model/schema/document-schema.js';
import type {
  DocumentSession,
  DocumentSessionOptions,
  SessionConnection,
  SessionDocument,
} from './document-session.js';
import type { DraftOffer } from './drafts.js';
import { loadPinnedTemplate, samePin } from './open-document.js';
import type { RoomBinding } from './room-binding.js';
import { createRoomDrafts } from './room-drafts.js';
import { followConnection, readConnection } from './room-follow.js';
import {
  type OpenedRoom,
  openRoom,
  roomContent,
  type RoomDraft,
  roomFailure,
  whenKept,
} from './room-open.js';
import { reloadRoom } from './room-reload.js';
import { keepRoomSelection } from './room-selection.js';
import { followSession, withCapabilities } from './session-follow.js';
import { createSessionStores, defaultState, type SessionStores } from './store-session.js';
import { changeTemplate, type TemplateCommit } from './template-change.js';
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
  const { connection, capabilities } = room;
  const shared = connection.doc;
  if (room.binding.shared !== shared) room.binding = room.rebind(shared);
  const { binding } = room;
  const pin = binding.pin();
  const template = await loadPinnedTemplate(options.host, pin, options.signal);
  if (!options.signal.aborted && (shared !== connection.doc || !samePin(pin, binding.pin()))) {
    return readRoom(room, options);
  }
  if (!template.ok) return template;
  const content = roomContent(binding);
  if (!content.ok) return content;
  const doc = content.value ?? options.schema.topNodeType.createAndFill();
  if (!doc) throw new Error('The schema cannot make an empty document.');
  const create = options.createState ?? defaultState(options.schema);
  const state = options.stores.withTemplate(template.value.template, () =>
    create(doc, { ...options.stores.context, room: { plugins: binding.plugins } }),
  );
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
export interface RoomRun {
  options: DocumentSessionOptions & { schema: Schema };
  signal: AbortSignal;
  stores: SessionStores;
  drafts: ReturnType<typeof createRoomDrafts>;
  follow: ReturnType<typeof followSession>;
  showPin: (
    pin: TemplatePin | null,
    binding: RoomBinding,
    commit?: TemplateCommit,
  ) => Promise<boolean>;
  current: { room: OpenedRoom | null; stops: (() => void)[]; stopPin: () => void };
}

/** Follows the pin of the binding, while loading its contents or after showing them. */
export function watchRoomPin(
  run: RoomRun,
  binding: RoomBinding,
  onPin: (pin: TemplatePin | null) => void = (pin) => void run.showPin(pin, binding),
) {
  run.current.stopPin();
  run.current.stopPin = binding.followPin(onPin);
}

// Leaves the room the session is connected to. The session holds no room by the time the
// connection closes, so a connection that fails to close leaves nothing half left.
function leaveRoom({ drafts, current }: RoomRun) {
  drafts.stop();
  for (const stop of current.stops.splice(0)) stop();
  current.stopPin();
  const { room } = current;
  current.room = null;
  room?.connection.close();
}

// Publishes the room's initial state and follows that connection until it is left.
function followRoom(run: RoomRun, room: OpenedRoom, shown: SessionDocument) {
  const { current, signal, stores } = run;
  const { document, status } = stores;
  const { connection, unreadable, reloading } = room;
  current.room = room;
  const granted = () => run.follow.granted(room.capabilities);
  const following = { cached: room.draft !== null, granted, unreadable, reloading };
  current.stops.push(followConnection(connection, stores, following));
  document.set(withCapabilities(shown, granted(), stores.connection.get()?.gate));
  watchRoomPin(run, room.binding);
  const stopReload = connection.onReload?.((reload) => reloadRoom(run, room, reload));
  if (stopReload) current.stops.push(stopReload);
  // The session may have closed, or left this room, by the time the refused draft was read. A
  // connection that fails to close does not keep the room from opening again, and a room that
  // cannot be opened again fails the session, with the draft still kept.
  const reopen = (draft: RoomDraft) => {
    if (signal.aborted || current.room !== room) return;
    try {
      leaveRoom(run);
    } finally {
      loadRoom(run, draft).catch((error: unknown) => {
        status.set({ ...status.get(), load: 'failed', error: roomFailure(error) });
        leaveRoom(run);
      });
    }
  };
  current.stops.push(run.drafts.follow(room, reopen));
}

// Opens the room; on a draft of an older generation, again without it, merging it in
// (DOCE-SESSION-6.10).
async function loadRoom(run: RoomRun, merged: RoomDraft | null = null): Promise<boolean> {
  const { options, signal, stores, current } = run;
  const { host, documentId, schema } = options;
  const { status } = stores;
  const syncing = () => status.set({ ...status.get(), load: 'syncing' });
  const skipDraft = merged !== null;
  const opened = await openRoom(
    host,
    { documentId, schema, signal, skipDraft, fieldKey: options.fieldKey },
    syncing,
  );
  const opening = { ...options, stores, signal };
  let read = opened.ok ? await readRoom(opened.value, opening) : opened;
  // The connection can replace its document again before the completed read is published.
  while (
    opened.ok &&
    !signal.aborted &&
    opened.value.binding.shared !== opened.value.connection.doc
  ) {
    read = await readRoom(opened.value, opening);
  }
  if (signal.aborted || !opened.ok || !read.ok) {
    if (opened.ok) opened.value.connection.close();
    if (!signal.aborted) {
      status.set({ ...status.get(), load: 'failed', error: read.ok ? null : read.error });
    }
    return false;
  }
  const room = opened.value;
  followRoom(run, room, read.value.document);
  run.follow.followTemplate(read.value.document.pin, read.value.saved);
  const pin = room.binding.pin();
  if (!samePin(pin, read.value.document.pin)) await run.showPin(pin, room.binding);
  await run.drafts.start(room, merged);
  if (signal.aborted || current.room !== room) return false;
  status.set({ ...status.get(), load: 'ready' });
  return true;
}

// With no editor bound nothing keeps the state and the room the same: the change is made on what
// the room holds by then and written there, or the editor that binds next would take the room's
// content over it. A whole state was made from what the session showed, so it is written only
// while the room still holds that, never over what the others changed since.
function roomUpdate(run: RoomRun): DocumentSession['update'] {
  const { document } = run.stores;
  return (update) => {
    const shown = document.get();
    if (!shown) return;
    const binding = run.current.room?.binding;
    const held = binding?.held(shown.state) ?? shown.state;
    const whole = typeof update !== 'function';
    const state = whole ? update : update(held);
    if (state === shown.state) return;
    if (state.doc !== held.doc && (!whole || held === shown.state)) binding?.write(state);
    document.set({ ...shown, state });
  };
}

// Leaving the room while a historical version shows, and joining it again after (DOCE-SESSION-3.10).
function createRoomPause(
  run: RoomRun,
  flush: () => Promise<boolean>,
): Pick<DocumentSession, 'suspend' | 'resume'> {
  let suspended = false;
  return {
    suspend: async () => {
      if (suspended || run.signal.aborted) return;
      suspended = true;
      await flush();
      // A resume that came while the changes were being kept wins: the room stays joined.
      if (!suspended || run.signal.aborted) return;
      leaveRoom(run);
      run.stores.connection.set(CONNECTING);
    },
    resume: async () => {
      if (!suspended || run.signal.aborted) return !run.signal.aborted;
      suspended = false;
      if (run.current.room) return true;
      return loadRoom(run);
    },
  };
}

function roomSetTemplate(run: RoomRun): DocumentSession['setTemplate'] {
  const { stores } = run;
  const allowed = () => stores.document.get()?.editingMode === 'edit';
  return (pin) => {
    const binding = run.current.room?.binding;
    if (!binding || !allowed()) return Promise.resolve(false);
    // The pin and the content moved to the template reach the room in one change.
    return run.showPin(pin, binding, {
      allowed,
      apply: (template) =>
        stores.withTemplate(template, () => {
          binding.setPin(pin, (held) => movedDocument(held, template));
          const shown = stores.document.get();
          if (!shown) return undefined;
          const held = binding.held(shown.state);
          return held === shown.state ? held : keepRoomSelection(held, shown.state.selection);
        }),
    });
  };
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
    stores.pending.commit();
    const opened = run.current.room;
    return opened ? whenKept(opened.connection) : Promise.resolve(true);
  };
  const follow = followSession({
    host,
    documentId,
    document,
    onLeave: () => void flush(),
    gate: () => stores.connection.get()?.gate ?? null,
  });
  const showPin = async (
    pin: TemplatePin | null,
    binding: RoomBinding,
    commit?: TemplateCommit,
  ) => {
    const isCurrent = () => run.current.room?.binding === binding;
    const changed = await changeTemplate({ host, signal, isCurrent, commit }, stores, pin);
    if (changed && isCurrent() && samePin(document.get()?.pin ?? null, pin)) {
      follow.followTemplate(pin, changed.saved);
    }
    return changed !== null;
  };
  const run: RoomRun = {
    options: { ...options, schema },
    signal,
    stores,
    drafts: createRoomDrafts({ host, documentId, schema, stores }),
    follow,
    showPin,
    current: { room: null, stops: [], stopPin: () => undefined },
  };
  const room = () => run.current.room;
  const pause = createRoomPause(run, flush);
  const close = () => {
    options.signal?.removeEventListener('abort', close);
    if (!signal.aborted) stores.pending.commit();
    controller.abort();
    follow.stop();
    run.drafts.close();
    leaveRoom(run);
  };
  // A signal aborted before the session was made closes it at once, before it connects.
  if (options.signal?.aborted) close();
  else options.signal?.addEventListener('abort', close, { once: true });

  return {
    documentId,
    mode: 'room',
    get author() {
      return host.identity.currentPerson().id;
    },
    status,
    document,
    // Left to settle: a draft's blocks a new room generation changed too (DOCE-SESSION-6.10).
    conflicts: stores.conflicts,
    connection: stores.connection,
    reloads: stores.reloads,
    ready: signal.aborted ? Promise.resolve(false) : loadRoom(run),
    update: roomUpdate(run),
    setTemplate: roomSetTemplate(run),
    save: () => flush().then(() => undefined),
    flush,
    ...pause,
    hasUnsavedChanges: () => room()?.connection.state().hasUnconfirmedChanges ?? false,
    holdPendingEdits: stores.pending.hold,
    ...NO_DRAFT_OFFER,
    resolveConflict: (id, choice) => run.drafts.resolve(room(), id, choice),
    close,
  };
}
