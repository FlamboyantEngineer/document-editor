// A store-mode session: the document loaded from the host's document store and saved back to it,
// against the revision it was edited from. It never loads the realtime library (D27).

import type { Node as ProseMirrorNode, Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { createDocumentEditing } from '../engine/document-editing.js';
import type { HostResult } from '../host/adapters.js';
import { resolveEditingMode } from '../host/capabilities.js';
import type { TemplateFile, TemplatePin } from '../model/format/template-format.js';
import { createDocumentSchema } from '../model/schema/document-schema.js';
import type {
  DocumentSession,
  DocumentSessionOptions,
  SessionDocument,
  SessionStateContext,
} from './document-session.js';
import {
  loadPinnedTemplate,
  type OpenedDocument,
  openStoredDocument,
  readStored,
} from './open-document.js';
import { followSession } from './session-follow.js';
import type { SessionStatus } from './status.js';
import { createStoreSaving, storeBaseline } from './store-saving.js';
import { createValueStore } from './value-store.js';

const DEFAULT_AUTOSAVE_DELAY = 1000;

const defaultState = (schema: Schema) => (doc: ProseMirrorNode, context: SessionStateContext) =>
  EditorState.create({ doc, plugins: createDocumentEditing(schema, context) });

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

// The stores a session keeps, and what its editor state reads from them.
function createSessionStores(options: DocumentSessionOptions) {
  const status = createValueStore<SessionStatus>({
    load: 'loading',
    save: 'idle',
    error: null,
    dirty: false,
  });
  const document = createValueStore<SessionDocument | null>(null);
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
  return { status, document, context, current, setLoaded };
}

type SessionStores = ReturnType<typeof createSessionStores>;
type StoreSaving = ReturnType<typeof createStoreSaving>;

// Pins another template: the document shows it and has a change to save.
async function changeTemplate(
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

/** Opens a document from the host's document store (DOCE-SESSION-1, DOCE-SESSION-2). */
export function createStoreSession(options: DocumentSessionOptions): DocumentSession {
  const { host, documentId } = options;
  const schema = options.schema ?? createDocumentSchema();
  const controller = new AbortController();
  const stores = createSessionStores(options);
  const { status, document } = stores;
  let saving: StoreSaving | null = null;
  const follow = followSession({
    host,
    documentId,
    document,
    onLeave: () => void saving?.flush(),
  });

  const load = async () => {
    const opened = await openStoredDocument(host, documentId, controller.signal);
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
      { host, documentId, status, current: stores.current, autosaveDelay },
      storeBaseline(read.value.state.doc, {
        revision: opened.value.stored.revision,
        pin: read.value.pin,
      }),
    );
    follow.followTemplate(read.value.pin, opened.value.template.saved);
    status.set({ ...status.get(), load: 'ready' });
    return true;
  };

  const close = () => {
    controller.abort();
    saving?.close();
    follow.stop();
  };
  options.signal?.addEventListener('abort', close, { once: true });

  return {
    documentId,
    mode: 'store',
    status,
    document,
    ready: load(),
    update: (update) => {
      const shown = document.get();
      if (!shown) return;
      const state = typeof update === 'function' ? update(shown.state) : update;
      if (state === shown.state) return;
      document.set({ ...shown, state });
      if (state.doc !== shown.state.doc) saving?.changed(state.doc, shown.pin);
    },
    setTemplate: async (pin) => {
      const changed = await changeTemplate({ host, signal: controller.signal }, stores, pin);
      if (!changed) return false;
      follow.followTemplate(pin, changed.saved);
      saving?.changed(changed.doc, pin);
      return true;
    },
    save: () => saving?.save() ?? Promise.resolve(),
    flush: () => saving?.flush() ?? Promise.resolve(true),
    hasUnsavedChanges: () => saving?.hasUnsavedChanges() ?? false,
    close,
  };
}
