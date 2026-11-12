// A document's named versions and history on the in-memory host: the history pane lists the
// versions, automatic ones folded under named ones; the reader saves and names a version, views one
// in place of the document with the template it pins, compares two, restores one, and returns to
// the document with the markup and comments they had before the view.

import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  DocumentEditor,
  DocumentHistory,
  DocumentHistoryBanner,
  historicalEditorProps,
  useDocumentSession,
  useDocumentVersions,
  useSessionValue,
} from '../../src/components/index.js';
import { createMemoryHost, FULL_CAPABILITIES } from '../../src/host/index.js';
import type { DocumentFile, TemplateFile } from '../../src/model/index.js';
import type { DocumentSession, DocumentVersions } from '../../src/session/index.js';
import { heading, text } from './lab-document.js';
import { markReadyWhenSettled } from './lab-ready.js';

const DOCUMENT_ID = 'lab';

const REPORT: TemplateFile = { formatVersion: 1, id: 'report', name: 'Report' };

const file = (rule: string, pinned: boolean): DocumentFile => ({
  formatVersion: 1,
  ...(pinned ? { template: { id: 'report' } } : {}),
  sections: [
    {
      name: null,
      content: [
        { ...heading(1, 'Scope'), attrs: { level: 1, id: 'a0000001' } },
        { type: 'paragraph', attrs: { id: 'a0000002' }, content: [text(rule)] },
      ],
    },
  ],
});

const HOST = createMemoryHost({
  person: { id: 'ada', name: 'Ada Lovelace' },
  templates: [REPORT],
  documents: [
    {
      id: DOCUMENT_ID,
      content: file('The system shall report each fault within one second.', true),
    },
  ],
});

// A history of four saved states: an automatic save and a named one, both pinned to the report
// template, then two automatic saves without it, the last the one the document opens at.
async function saveHistory() {
  const saves = [
    { words: 'within one second of detecting it', pinned: true },
    { words: 'within two seconds', pinned: false },
    { words: 'within two seconds of detecting it', pinned: false },
  ];
  for (const [index, { words, pinned }] of saves.entries()) {
    await HOST.documents.save(DOCUMENT_ID, {
      content: file(`The system shall report each fault ${words}.`, pinned),
      baseRevision: `rev-${String(index + 1)}`,
    });
  }
  await HOST.versions?.rename?.(DOCUMENT_ID, 'rev-2', 'First draft');
}

type Markup = 'all' | 'final';

// What the reader has beside the document, which a historical view keeps until they return.
interface ReaderSettings {
  markup: Markup;
  comments: boolean;
}

function Settings({
  settings,
  onChange,
}: {
  settings: ReaderSettings;
  onChange: (settings: ReaderSettings) => void;
}) {
  return (
    <fieldset>
      <legend>Reader</legend>
      <label>
        Markup{' '}
        <select
          value={settings.markup}
          onChange={(event) => onChange({ ...settings, markup: event.target.value as Markup })}
        >
          <option value="all">All markup</option>
          <option value="final">Final</option>
        </select>
      </label>{' '}
      <label>
        <input
          type="checkbox"
          checked={settings.comments}
          onChange={(event) => onChange({ ...settings, comments: event.target.checked })}
        />{' '}
        Comments
      </label>
    </fieldset>
  );
}

function History({
  session,
  versions,
}: {
  session: DocumentSession;
  versions: DocumentVersions<ReaderSettings>;
}) {
  const [settings, setSettings] = useState<ReaderSettings>({ markup: 'all', comments: true });
  const document = useSessionValue(session.document);
  const view = useSessionValue(versions.view);
  if (!document) return <p>Opening the document…</p>;
  const shown = view ? historicalEditorProps(versions, { view }) : null;
  return (
    <div className="lab-layout">
      <div>
        <Settings settings={settings} onChange={setSettings} />
        <output aria-label="Showing">
          {view ? view.version.version.revision : 'The document'}
        </output>{' '}
        <output aria-label="Reader settings">
          {`${settings.markup} markup, comments ${settings.comments ? 'shown' : 'hidden'}`}
        </output>{' '}
        <output aria-label="Template shown">{(shown?.template ?? document.template).id}</output>
        <DocumentHistoryBanner versions={versions} onReturn={setSettings} />
        <DocumentEditor
          {...(shown ?? {
            state: document.state,
            onStateChange: session.update,
            template: document.template,
            editable: true,
          })}
          markup={view ? 'final' : settings.markup}
          aria-label="Sample document"
        />
      </div>
      <aside>
        <DocumentHistory
          versions={versions}
          capabilities={FULL_CAPABILITIES}
          returnTo={settings}
          onReturn={setSettings}
          identity={HOST.identity}
        />
      </aside>
    </div>
  );
}

function Lab() {
  const session = useDocumentSession({
    host: HOST,
    documentId: DOCUMENT_ID,
    mode: 'store',
    autosaveDelay: 800,
  });
  const versions = useDocumentVersions<ReaderSettings>({ host: HOST, session });
  if (!session || versions === null) return null;
  return <History session={session} versions={versions} />;
}

const container = document.querySelector('#lab-editor');
if (container) {
  void saveHistory().then(() => {
    createRoot(container).render(<Lab />);
    markReadyWhenSettled();
  });
}
