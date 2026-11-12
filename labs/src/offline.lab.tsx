// Drafts on the in-memory host: the store starts over on each reload, as after a crash, and the
// drafts live in the tab's session storage, so a reload finds the unsaved content kept and the
// session offers it.

import { createRoot } from 'react-dom/client';
import {
  DocumentEditor,
  DocumentSessionBoundary,
  useDocumentSession,
  useSessionValue,
} from '../../src/components/index.js';
import {
  createMemoryHost,
  type DocumentDraft,
  type DraftsAdapter,
  type HostResult,
} from '../../src/host/index.js';
import type { DocumentFile } from '../../src/model/index.js';
import type { DocumentSession } from '../../src/session/index.js';
import { heading, text } from './lab-document.js';
import { markReadyWhenSettled } from './lab-ready.js';

const DOCUMENT_ID = 'lab';

const DOCUMENT: DocumentFile = {
  formatVersion: 1,
  sections: [
    {
      name: null,
      content: [
        { ...heading(1, 'Scope'), attrs: { level: 1, id: 'a0000001' } },
        {
          type: 'paragraph',
          attrs: { id: 'a0000002' },
          content: [text('The system shall report each fault within one second.')],
        },
      ],
    },
  ],
};

const done = <T,>(value: T): Promise<HostResult<T>> => Promise.resolve({ ok: true, value });

// Byte arrays as JSON keeps them: lists of numbers.
const replacer = (_key: string, value: unknown) =>
  value instanceof Uint8Array ? { bytes: [...value] } : value;
const reviver = (_key: string, value: unknown) =>
  value && typeof value === 'object' && 'bytes' in value && Array.isArray(value.bytes)
    ? new Uint8Array(value.bytes as number[])
    : value;

/** Drafts in the tab's session storage, which survives a reload. */
function createSessionStorageDrafts(): DraftsAdapter {
  const key = (documentId: string, mode: DocumentDraft['mode']) =>
    `offline-lab:${mode}:${documentId}`;
  return {
    get: (documentId, mode) => {
      const stored = sessionStorage.getItem(key(documentId, mode));
      return done(stored ? (JSON.parse(stored, reviver) as DocumentDraft) : null);
    },
    put: (documentId, draft) => {
      sessionStorage.setItem(key(documentId, draft.mode), JSON.stringify(draft, replacer));
      return done(null);
    },
    clear: (documentId, mode) => {
      sessionStorage.removeItem(key(documentId, mode));
      return done(null);
    },
  };
}

const HOST = {
  ...createMemoryHost({
    person: { id: 'ada', name: 'Ada Lovelace' },
    documents: [{ id: DOCUMENT_ID, content: DOCUMENT }],
  }),
  drafts: createSessionStorageDrafts(),
};

function DraftOffer({ session }: { session: DocumentSession }) {
  const offer = useSessionValue(session.draft);
  if (!offer) return null;
  return (
    <div role="status" aria-label="Draft">
      {`A draft kept ${new Date(offer.savedAt).toLocaleTimeString()}${offer.outdated ? ', from an older save,' : ''} has unsaved changes. `}
      <button type="button" onClick={() => void session.restoreDraft()}>
        Restore draft
      </button>{' '}
      <button type="button" onClick={() => session.discardDraft()}>
        Discard draft
      </button>
    </div>
  );
}

function SessionStatusLine({ session }: { session: DocumentSession }) {
  const status = useSessionValue(session.status);
  return <output aria-label="Session status">{`${status.load} · ${status.save}`}</output>;
}

function Lab() {
  const session = useDocumentSession({
    host: HOST,
    documentId: DOCUMENT_ID,
    mode: 'store',
    // Saves only when asked, so a reload leaves the changes unsaved.
    autosaveDelay: 24 * 60 * 60 * 1000,
  });
  if (!session) return null;
  return (
    <>
      <fieldset>
        <legend>Store</legend>
        <button type="button" onClick={() => void session.save()}>
          Save now
        </button>{' '}
        <SessionStatusLine session={session} />
      </fieldset>
      <DraftOffer session={session} />
      <DocumentSessionBoundary
        session={session}
        fallback={<p>Opening the document…</p>}
        renderError={(error) => (
          <p role="alert">{`The document did not open: ${error?.kind ?? 'unknown'}`}</p>
        )}
      >
        {(props) => <DocumentEditor {...props} aria-label="Sample document" />}
      </DocumentSessionBoundary>
    </>
  );
}

const container = document.querySelector('#lab-editor');
if (container) {
  createRoot(container).render(<Lab />);
  markReadyWhenSettled();
}
