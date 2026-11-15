import type { HostResult } from '../host/adapters.js';
import type { DocumentFile } from '../model/format/document-format.js';
import { writeDocumentFile } from '../model/format/document-format-write.js';
import type { SessionDocument } from './document-session.js';
import { failure, readStored, samePin } from './open-document.js';
import type { DocumentVersionsOptions, NewVersion } from './versions.js';

interface PreparedVersion extends NewVersion {
  baseContent: DocumentFile;
}

// The host's raw representation can retain default attributes the writer omits. Verify it is
// still the captured state before using its detached bytes as the conditional-create baseline.
async function captureBaseline(
  { host, session }: DocumentVersionsOptions,
  shown: SessionDocument,
  content: DocumentFile,
): Promise<HostResult<DocumentFile>> {
  if (session.mode === 'room') return { ok: true, value: structuredClone(content) };
  const stored = await host.documents.load(session.documentId);
  if (!stored.ok) return stored;
  const read = readStored(stored.value.content, shown.state.schema);
  if (!read.ok) return read;
  const captured = readStored(content, shown.state.schema);
  if (!captured.ok) return captured;
  if (
    !read.value.doc.eq(captured.value.doc) ||
    !samePin(stored.value.content.template ?? null, shown.pin)
  )
    return {
      ok: false,
      error: failure('conflict', 'The document changed before the version was captured.'),
    };
  return { ok: true, value: structuredClone(stored.value.content) };
}

/** Captures a conditional baseline before a hook can transform the requested version. */
export async function prepareVersion(
  options: DocumentVersionsOptions,
  label: string | null,
): Promise<HostResult<PreparedVersion | null>> {
  const { session, beforeVersion } = options;
  if (!(await session.flush()))
    return { ok: false, error: session.status.get().error ?? failure('unavailable') };
  const shown = session.document.get();
  if (!shown) return { ok: false, error: failure('unavailable', 'The document is not loaded.') };
  const content = writeDocumentFile(shown.state.doc, { template: shown.pin });
  const baseline = await captureBaseline(options, shown, content);
  if (!baseline.ok) return baseline;
  const version = { content, label };
  const prepared = beforeVersion ? await beforeVersion(version) : version;
  return { ok: true, value: prepared ? { ...prepared, baseContent: baseline.value } : null };
}
