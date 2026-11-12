// A store-mode session: the document loaded from the host's document store and saved back to it,
// against the revision it was edited from. It never loads the realtime library (D27).

import type { Node as ProseMirrorNode, Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { createDocumentEditing } from '../engine/document-editing.js';
import { isRemoteTransaction } from '../engine/transaction-kind.js';
import type { HostResult } from '../host/adapters.js';
import { resolveEditingMode } from '../host/capabilities.js';
import type { TemplateFile, TemplatePin } from '../model/format/template-format.js';
import { createDocumentSchema } from '../model/schema/document-schema.js';
import type {
  DocumentSession,
  DocumentSessionOptions,
  SessionConnection,
  SessionDocument,
  SessionStateContext,
  SessionStateUpdate,
} from './document-session.js';
import { createSessionDrafts } from './drafts.js';
import type { MergeConflict } from './merge.js';
import {
  loadPinnedTemplate,
  type OpenedDocument,
  openStoredDocument,
  readStored,
} from './open-document.js';
import { followSession } from './session-follow.js';
import type { SessionStatus } from './status.js';
import { createStoreRefresh } from './store-refresh.js';
import { createStoreSaving, storeBaseline } from './store-saving.js';
import { createValueStore } from './value-store.js';

const DEFAULT_AUTOSAVE_DELAY = 1000;
const DEFAULT_DRAFT_DELAY = 300;

/**
 * The editor state the session makes by default: the document's editing plugins, and in room mode
 * the room's, with the room's undo in place of the editor's history.
 */
export const defaultState =
  (schema: Schema) => (doc: ProseMirrorNode, context: SessionStateContext) => {
    const { room } = context;
    const editing = createDocumentEditing(schema, {
      ...context,
      ...(room ? { history: false, isRemote: isRemoteTransaction } : {}),
    });
    return EditorState.create({ doc, plugins: [...editing, ...(room?.plugins ?? [])] });
  };

// The loaded document, read for the editor, or why it cannot be.
function readOpened(
  opened: OpenedDocument,
  options: DocumentSessionOptions & { schema: Schema; context: SessionStateContext },
): HostResult<SessionDocument> {
  const read = readStored(opened.stored.content, options.schema);
  if (!read.ok) return read;
  const create = options.createState ?? defaultState(options.schema);
  const { template } = opened.template;
  return {
    ok: true,
    value: {
      state: create(read.value.doc, options.context),
      template,
      pin: opened.stored.content.template ?? null,
      templateUpdate: null,
      capabilities: opened.capabilities,
      editingMode: resolveEditingMode(opened.capabilities),
    },
  };
}

/** The stores a session keeps, and what its editor state reads from them. */
export function createSessionStores(
  options: DocumentSessionOptions,
  load: SessionStatus['load'] = 'loading',
) {
  const status = createValueStore<SessionStatus>({
    load,
    save: 'idle',
    error: null,
    dirty: false,
  });
  const document = createValueStore<SessionDocument | null>(null);
  const conflicts = createValueStore<readonly MergeConflict[]>([]);
  const connection = createValueStore<SessionConnection | null>(null);
  // The template a state is made in reads the loaded one until the document shows.
  let loaded: TemplateFile | null = null;
  const context: SessionStateContext = {
    template: () => {
      const template = document.get()?.template ?? loaded;
      if (!template) throw new Error('The session has no template yet.');
      return template;
    },
    author: () => options.host.identity.currentPerson().id,
  };
  const current = () => {
    const shown = document.get();
    return shown ? { doc: shown.state.doc, pin: shown.pin } : null;
  };
  const setLoaded = (template: TemplateFile) => {
    loaded = template;
  };
  return { status, document, conflicts, connection, context, current, setLoaded };
}

export type SessionStores = ReturnType<typeof createSessionStores>;
type StoreSaving = ReturnType<typeof createStoreSaving>;

/** Shows another template the document pins; null when it cannot load or the document is gone. */
export async function changeTemplate(
  { host, signal }: { host: DocumentSessionOptions['host']; signal: AbortSignal },
  { status, document }: SessionStores,
  pin: TemplatePin | null,
) {
  const loaded = await loadPinnedTemplate(host, pin, signal);
  const shown = document.get();
  if (!loaded.ok) status.set({ ...status.get(), error: loaded.error });
  if (!loaded.ok || !shown || signal.aborted) return null;
  document.set({ ...shown, template: loaded.value.template, pin, templateUpdate: null });
  return { doc: shown.state.doc, saved: loaded.value.saved };
}

// What a session takes in and keeps beside saving: other writers' saves (DOCE-SESSION-4, 7) and its
// drafts (DOCE-SESSION-6).
function sessionParts(
  options: DocumentSessionOptions & { schema: Schema },
  stores: SessionStores,
  parts: {
    signal: AbortSignal;
    session: () => DocumentSession;
    saving: () => StoreSaving | null;
  },
) {
  const { schema } = options;
  const { signal, saving } = parts;
  const drafts = createSessionDrafts({
    ...options,
    ...stores,
    delay: options.draftDelay ?? DEFAULT_DRAFT_DELAY,
    createState: (doc) => (options.createState ?? defaultState(schema))(doc, stores.context),
    setTemplate: (pin) => parts.session().setTemplate(pin),
    saving,
  });
  const refresh = createStoreRefresh({ ...options, ...stores, schema, signal, saving });
  return { drafts, refresh };
}

// Commits the editor's new state, measuring a changed document for saving.
function commitState(
  { document, saving }: { document: SessionStores['document']; saving: StoreSaving | null },
  update: SessionStateUpdate,
) {
  const shown = document.get();
  if (!shown) return;
  const state = typeof update === 'function' ? update(shown.state) : update;
  if (state === shown.state) return;
  document.set({ ...shown, state });
  if (state.doc !== shown.state.doc) saving?.changed(state.doc, shown.pin);
}

/** Opens a document from the host's document store (DOCE-SESSION-1, DOCE-SESSION-2). */
export function createStoreSession(options: DocumentSessionOptions): DocumentSession {
  const { host, documentId } = options;
  const schema = options.schema ?? createDocumentSchema();
  const controller = new AbortController();
  const stores = createSessionStores(options);
  const { status, document, conflicts } = stores;
  let saving: StoreSaving | null = null;
  const { drafts, refresh } = sessionParts({ ...options, schema }, stores, {
    signal: controller.signal,
    session: () => session,
    saving: () => saving,
  });
  const onLeave = () => void saving?.flush();
  const follow = followSession({ host, documentId, document, onLeave });

  const load = async () => {
    const opened = await openStoredDocument(host, documentId, controller.signal);
    if (opened.ok) await drafts.load(opened.value.stored);
    if (controller.signal.aborted) return false;
    const context = stores.context;
    if (opened.ok) stores.setLoaded(opened.value.template.template);
    const read = opened.ok ? readOpened(opened.value, { ...options, schema, context }) : opened;
    if (!read.ok || !opened.ok) {
      status.set({ ...status.get(), load: 'failed', error: read.ok ? null : read.error });
      return false;
    }
    document.set(read.value);
    const autosaveDelay = options.autosaveDelay ?? DEFAULT_AUTOSAVE_DELAY;
    saving = createStoreSaving(
      {
        host,
        documentId,
        status,
        current: stores.current,
        autosaveDelay,
        onConflict: refresh.onConflict,
      },
      storeBaseline(read.value.state.doc, opened.value.stored),
    );
    follow.followTemplate(read.value.pin, opened.value.template.saved);
    stopRefresh = refresh.follow();
    status.set({ ...status.get(), load: 'ready' });
    return true;
  };

  let stopRefresh = () => undefined as void;
  const close = () => {
    controller.abort();
    stopRefresh();
    saving?.close();
    drafts.close();
    follow.stop();
  };
  options.signal?.addEventListener('abort', close, { once: true });

  const session: DocumentSession = {
    documentId,
    mode: 'store',
    status,
    document,
    conflicts,
    connection: stores.connection,
    ready: load(),
    update: (update) => commitState({ document, saving }, update),
    setTemplate: async (pin) => {
      const changed = await changeTemplate({ host, signal: controller.signal }, stores, pin);
      if (!changed) return false;
      follow.followTemplate(pin, changed.saved);
      saving?.changed(changed.doc, pin);
      return true;
    },
    ...drafts.members,
    save: () => saving?.save() ?? Promise.resolve(),
    flush: () => saving?.flush() ?? Promise.resolve(true),
    resolveConflict: refresh.resolve,
    hasUnsavedChanges: () => saving?.hasUnsavedChanges() ?? false,
    close,
  };
  return session;
}
