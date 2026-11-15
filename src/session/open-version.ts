import type { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { createDocumentEditing } from '../engine/document-editing.js';
import type { DocumentVersion, HostResult, VersionStoreAdapter } from '../host/adapters.js';
import { createHistoricalComments } from '../host/historical-comments.js';
import type { SessionStateContext } from './document-session.js';
import { loadPinnedTemplate, readStored } from './open-document.js';
import type { DocumentVersionsOptions, OpenedVersion } from './versions.js';

// Opens a version: its content read for the editor and the template it pins.
export async function openVersion(
  options: DocumentVersionsOptions & { schema: Schema; store: VersionStoreAdapter },
  version: DocumentVersion,
): Promise<HostResult<OpenedVersion>> {
  const { host, session, schema, store } = options;
  const snapshot = store.loadSnapshot
    ? await store.loadSnapshot(session.documentId, version.revision)
    : null;
  if (snapshot && !snapshot.ok) return snapshot;
  const loaded = snapshot?.ok
    ? { ok: true as const, value: snapshot.value.content }
    : await store.load(session.documentId, version.revision);
  if (!loaded.ok) return loaded;
  const threads = snapshot?.ok ? structuredClone(snapshot.value.threads) : null;
  const comments = createHistoricalComments(session.documentId, threads ?? []);
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
  return {
    ok: true,
    value: { version, state, template: template.value.template, pin, threads, comments },
  };
}
