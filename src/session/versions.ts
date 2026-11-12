// A document's named versions and history beside its session: the versions the host keeps, listed
// and followed, saving the session's document as a named version, renaming one, opening one to
// read with the template it pins, and restoring one as the document's content (D26, D14).

import type { Node as ProseMirrorNode, Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { createDocumentEditing } from '../engine/document-editing.js';
import { markSystemChange } from '../engine/transaction-kind.js';
import type {
  DocumentVersion,
  EditorHost,
  HostError,
  HostResult,
  VersionStoreAdapter,
} from '../host/adapters.js';
import type { DocumentFile } from '../model/format/document-format.js';
import { writeDocumentFile } from '../model/format/document-format-write.js';
import type { TemplateFile, TemplatePin } from '../model/format/template-format.js';
import { createDocumentSchema } from '../model/schema/document-schema.js';
import type {
  DocumentSession,
  SessionStateContext,
  SessionStateUpdate,
} from './document-session.js';
import { failure, loadPinnedTemplate, readStored } from './open-document.js';
import { createValueStore, type ValueStore } from './value-store.js';
import { groupVersions, type VersionGroup } from './version-groups.js';

/** A version about to be saved: its content and name, which a `beforeVersion` hook may change. */
export interface NewVersion {
  content: DocumentFile;
  label: string | null;
}

/** The document's versions as the host lists them. */
export interface VersionList {
  status: 'loading' | 'ready' | 'failed';
  /** Newest first; the first is the document's current saved state. */
  versions: readonly DocumentVersion[];
  /** The versions grouped for the history (`groupVersions`). */
  groups: readonly VersionGroup[];
  error: HostError | null;
}

/** A version opened to read: its content, read-only, with the template it pins. */
export interface OpenedVersion {
  version: DocumentVersion;
  /** An editor state of the version's content, made as the session makes its own. */
  state: EditorState;
  /** The template the version pins, at the revision it pins, resolved. */
  template: TemplateFile;
  pin: TemplatePin | null;
}

/** A historical view: a version shown in place of the document, until the reader returns. */
export interface HistoricalView<R> {
  version: OpenedVersion;
  /** The older version the view compares it with, or null. */
  previous: OpenedVersion | null;
  /** What the reader had before the view, given back on return: such as mode, markup and comments. */
  returnTo: R;
}

export interface DocumentVersionsOptions {
  host: EditorHost;
  /** The open document whose versions these are. */
  session: DocumentSession;
  /** Makes a version's editor state. Defaults to the document's editing plugins. */
  createState?: ((doc: ProseMirrorNode, context: SessionStateContext) => EditorState) | undefined;
  /** Runs before a named version is saved: returns the version to save, or null to save none. */
  beforeVersion?:
    ((version: NewVersion) => NewVersion | null | Promise<NewVersion | null>) | undefined;
}

/** A document's versions (DOCE-VERSIONS-4, DOCE-VERSIONS-5). */
export interface DocumentVersions<R> {
  /** The session whose document's versions these are. */
  readonly session: DocumentSession;
  readonly list: ValueStore<VersionList>;
  /** The historical view shown, or null while the document is. */
  readonly view: ValueStore<HistoricalView<R> | null>;
  /** Lists the versions again. */
  refresh(): Promise<void>;
  /** Keeps the document's changes, then saves its content as a version named `label`. */
  saveVersion(label: string | null): Promise<HostResult<DocumentVersion>>;
  /** Names a version, or takes its name away with null. */
  rename(revision: string, label: string | null): Promise<HostResult<DocumentVersion>>;
  /** Shows a version in place of the document, compared with an older one when given. */
  viewVersion(
    revision: string,
    options: { returnTo: R; compareWith?: string | null | undefined },
  ): Promise<HostResult<HistoricalView<R>>>;
  /** Commits the editor state of the version shown, such as a new selection: the view's `onStateChange`. */
  updateView(update: SessionStateUpdate): void;
  /** Ends the historical view, giving back what the reader had before it; null when none shows. */
  returnFromView(): R | null;
  /** Makes a version's content and template the document's, as an edit the reader may undo, and saves it. */
  restore(revision: string): Promise<HostResult<DocumentVersion>>;
  /** Stops following the host's versions. */
  close(): void;
}

const unsupported = (what: string) => failure('unavailable', `The host cannot ${what} versions.`);

const samePin = (one: TemplatePin | null, other: TemplatePin | null) =>
  (one?.id ?? null) === (other?.id ?? null) &&
  (one?.revision ?? null) === (other?.revision ?? null);

const findVersion = (list: VersionList, revision: string) =>
  list.versions.find((version) => version.revision === revision);

// Opens a version: its content read for the editor and the template it pins.
async function openVersion(
  options: DocumentVersionsOptions & { schema: Schema; store: VersionStoreAdapter },
  version: DocumentVersion,
): Promise<HostResult<OpenedVersion>> {
  const { host, session, schema, store } = options;
  const loaded = await store.load(session.documentId, version.revision);
  if (!loaded.ok) return loaded;
  const pin = loaded.value.template ?? null;
  const template = await loadPinnedTemplate(host, pin);
  if (!template.ok) return template;
  const read = readStored(loaded.value, schema);
  if (!read.ok) return read;
  const context: SessionStateContext = {
    template: () => template.value.template,
    author: () => null,
  };
  const state = options.createState
    ? options.createState(read.value.doc, context)
    : EditorState.create({ doc: read.value.doc, plugins: createDocumentEditing(schema, context) });
  return { ok: true, value: { version, state, template: template.value.template, pin } };
}

// The session's document as a new version, after the hook, or null when the hook saves none.
async function newVersion(
  { session, beforeVersion }: DocumentVersionsOptions,
  label: string | null,
): Promise<HostResult<NewVersion | null>> {
  if (!(await session.flush()))
    return { ok: false, error: session.status.get().error ?? failure('unavailable') };
  const shown = session.document.get();
  if (!shown) return { ok: false, error: failure('unavailable', 'The document is not loaded.') };
  const version = { content: writeDocumentFile(shown.state.doc, { template: shown.pin }), label };
  return { ok: true, value: beforeVersion ? await beforeVersion(version) : version };
}

// Edits the session's document to a version's content and template, then saves it.
async function restoreThrough(session: DocumentSession, opened: OpenedVersion) {
  const shown = session.document.get();
  if (!shown) return failure('unavailable', 'The document is not loaded.');
  if (!samePin(shown.pin, opened.pin) && !(await session.setTemplate(opened.pin))) {
    return session.status.get().error ?? failure('unavailable');
  }
  const { doc } = opened.state;
  session.update((state) =>
    state.apply(markSystemChange(state.tr.replaceWith(0, state.doc.content.size, doc.content))),
  );
  await session.save();
  return session.status.get().error;
}

// The host's list of a document's versions, followed until `stop`.
function followVersionList(store: VersionStoreAdapter | undefined, documentId: string) {
  const list = createValueStore<VersionList>({
    status: 'loading',
    versions: [],
    groups: [],
    error: null,
  });
  const controller = new AbortController();
  const refresh = async () => {
    if (!store) {
      list.set({ ...list.get(), status: 'failed', error: unsupported('list') });
      return;
    }
    const listed = await store.list(documentId, controller.signal);
    if (controller.signal.aborted) return;
    const { value } = listed.ok ? listed : { value: null };
    list.set(
      value
        ? { status: 'ready', versions: value, groups: groupVersions(value), error: null }
        : { ...list.get(), status: 'failed', error: listed.ok ? null : listed.error },
    );
  };
  const unsubscribe = store?.subscribe?.(documentId, () => void refresh()) ?? (() => undefined);
  void refresh();
  const stop = () => {
    controller.abort();
    unsubscribe();
  };
  return { list, refresh, stop };
}

type ViewParts<R> = Pick<
  DocumentVersions<R>,
  'view' | 'viewVersion' | 'updateView' | 'returnFromView'
>;

// The historical view: versions opened by `open`, shown until the reader returns.
function createHistoricalView<R>(
  open: (revision: string) => Promise<HostResult<OpenedVersion>>,
): ViewParts<R> {
  const view = createValueStore<HistoricalView<R> | null>(null);
  return {
    view,
    viewVersion: async (revision, { returnTo, compareWith = null }) => {
      const [version, previous] = await Promise.all([
        open(revision),
        compareWith === null ? null : open(compareWith),
      ]);
      if (!version.ok) return version;
      if (previous && !previous.ok) return previous;
      // A view opened while another shows keeps what the reader had before the first.
      const shown = {
        version: version.value,
        previous: previous?.value ?? null,
        returnTo: view.get()?.returnTo ?? returnTo,
      };
      view.set(shown);
      return { ok: true, value: shown };
    },
    updateView: (update) => {
      const shown = view.get();
      if (!shown) return;
      const state = typeof update === 'function' ? update(shown.version.state) : update;
      view.set({ ...shown, version: { ...shown.version, state } });
    },
    returnFromView: () => {
      const shown = view.get();
      view.set(null);
      return shown?.returnTo ?? null;
    },
  };
}

/** Follows a document's versions beside its session (DOCE-VERSIONS-4.1). */
export function createDocumentVersions<R>(options: DocumentVersionsOptions): DocumentVersions<R> {
  const { host, session } = options;
  const { documentId } = session;
  const store = host.versions;
  const { list, refresh, stop } = followVersionList(store, documentId);
  // Versions are read with the session's schema, so a restored version's nodes are the document's.
  const schemaOf = () => session.document.get()?.state.schema ?? createDocumentSchema();
  const open = (revision: string): Promise<HostResult<OpenedVersion>> => {
    const version = findVersion(list.get(), revision);
    if (!store) return Promise.resolve({ ok: false, error: unsupported('open') });
    if (!version) return Promise.resolve({ ok: false, error: failure('not-found') });
    return openVersion({ ...options, schema: schemaOf(), store }, version);
  };
  return {
    session,
    list,
    ...createHistoricalView<R>(open),
    refresh,
    saveVersion: async (label) => {
      if (!store?.create) return { ok: false, error: unsupported('save') };
      const made = await newVersion(options, label);
      if (!made.ok) return made;
      if (!made.value) return { ok: false, error: failure('denied', 'No version was saved.') };
      const saved = await store.create(documentId, made.value);
      if (saved.ok) await refresh();
      return saved;
    },
    rename: async (revision, label) => {
      if (!store?.rename) return { ok: false, error: unsupported('rename') };
      const renamed = await store.rename(documentId, revision, label);
      if (renamed.ok) await refresh();
      return renamed;
    },
    restore: async (revision) => {
      const opened = await open(revision);
      if (!opened.ok) return opened;
      const error = await restoreThrough(session, opened.value);
      return error ? { ok: false, error } : { ok: true, value: opened.value.version };
    },
    close: stop,
  };
}
