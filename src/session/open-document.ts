// Opening a stored document for a session: the document, the template it pins with the chain it
// inherits, and what the reader may do with it.

import type { Schema } from 'prosemirror-model';
import type {
  EditorHost,
  HostError,
  HostResult,
  SavedState,
  StoredDocument,
} from '../host/adapters.js';
import { type EditorCapabilities, READ_ONLY_CAPABILITIES } from '../host/capabilities.js';
import type { DocumentFile } from '../model/format/document-format.js';
import {
  isDocumentFormatError,
  readDocumentFile,
} from '../model/format/document-format-convert.js';
import type { TemplateFile, TemplatePin } from '../model/format/template-format.js';
import { resolveTemplateFileAsync } from '../model/format/template-format-resolve.js';
import { BASE_TEMPLATE, BASE_TEMPLATE_ID } from '../model/templates/base-template.js';

/** A failure, as a session reports it. */
export const failure = (kind: HostError['kind'], message?: string): HostError =>
  message === undefined ? { kind } : { kind, message };

/** A document's template, resolved, and the saved state of the template it pins, if any. */
export interface PinnedTemplate {
  template: TemplateFile;
  saved: SavedState | null;
}

/**
 * The template a document pins, at the revision it pins, with the chain it inherits merged under
 * it; the base template for a document that pins none or a host without templates.
 */
export async function loadPinnedTemplate(
  host: EditorHost,
  pin: TemplatePin | null | undefined,
  signal?: AbortSignal,
): Promise<HostResult<PinnedTemplate>> {
  const source = host.templates;
  const options = {
    baseTemplateId: BASE_TEMPLATE_ID,
    loadTemplate: async (id: string) => {
      if (id === BASE_TEMPLATE_ID && !source) return BASE_TEMPLATE;
      const loaded = await source?.load(id, { signal });
      if (loaded?.ok) return loaded.value.template;
      return id === BASE_TEMPLATE_ID ? BASE_TEMPLATE : null;
    },
  };
  if (!pin || !source) {
    const template = await resolveTemplateFileAsync(BASE_TEMPLATE, options);
    return { ok: true, value: { template, saved: null } };
  }
  const pinned = await source.load(pin.id, { revision: pin.revision ?? undefined, signal });
  if (!pinned.ok) return pinned;
  const { revision, sequence } = pinned.value;
  const template = await resolveTemplateFileAsync(pinned.value.template, options);
  return { ok: true, value: { template, saved: { revision, sequence } } };
}

/** The reader's capabilities on a document; none when the host cannot say. */
export async function loadCapabilities(
  host: EditorHost,
  documentId: string,
): Promise<EditorCapabilities> {
  try {
    return await host.permissions.capabilities(documentId);
  } catch {
    return READ_ONLY_CAPABILITIES;
  }
}

/** A stored document's content read for the editor, or why it cannot be. */
export function readStored(
  content: DocumentFile,
  schema: Schema,
): HostResult<ReturnType<typeof readDocumentFile>> {
  try {
    return { ok: true, value: readDocumentFile(content, schema, { unknown: 'keep' }) };
  } catch (error) {
    if (!isDocumentFormatError(error)) throw error;
    return { ok: false, error: failure('unavailable', error.message) };
  }
}

/** A stored document, its template and the reader's capabilities, loaded together. */
export interface OpenedDocument {
  stored: StoredDocument;
  template: PinnedTemplate;
  capabilities: EditorCapabilities;
}

/** Loads a document from the host's store, with its template and the reader's capabilities. */
export async function openStoredDocument(
  host: EditorHost,
  documentId: string,
  signal?: AbortSignal,
): Promise<HostResult<OpenedDocument>> {
  const [stored, capabilities] = await Promise.all([
    host.documents.load(documentId, signal),
    loadCapabilities(host, documentId),
  ]);
  if (!stored.ok) return stored;
  const template = await loadPinnedTemplate(host, stored.value.content.template, signal);
  if (!template.ok) return template;
  return { ok: true, value: { stored: stored.value, template: template.value, capabilities } };
}
