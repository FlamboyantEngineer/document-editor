// Restoring a version as the document's content. In store mode, a host that restores versions
// itself saves the version as a new state, and the session takes it in like any other save
// (DOCE-SESSION-7). Otherwise, and in a shared room, the session's document is edited to the
// version's content and template and saved like any other change.

import { markSystemChange } from '../engine/transaction-kind.js';
import type { EditorHost, HostError } from '../host/adapters.js';
import type { DocumentSession } from './document-session.js';
import { failure, samePin } from './open-document.js';
import type { OpenedVersion } from './versions.js';

const notLoaded = () => failure('unavailable', 'The document is not loaded.');

// Edits the session's document to a version's content and template, then saves it.
async function restoreByEditing(session: DocumentSession, opened: OpenedVersion) {
  const shown = session.document.get();
  if (!shown) return notLoaded();
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

/** Makes an opened version the document's content; null once done, or why it could not be. */
export async function restoreVersion(
  { host, session }: { host: EditorHost; session: DocumentSession },
  opened: OpenedVersion,
): Promise<HostError | null> {
  const restore = host.versions?.restore;
  const takesInSaves = session.mode === 'store' && host.documents.subscribe !== undefined;
  if (!restore || !takesInSaves) return restoreByEditing(session, opened);
  // The reader's changes are kept first, so the restored state supersedes them rather than
  // merging with them.
  if (!(await session.flush())) return session.status.get().error ?? failure('unavailable');
  const restored = await restore(session.documentId, opened.version.revision);
  return restored.ok ? null : restored.error;
}
