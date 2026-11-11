// Shows a document's changes from an older version (the document editor's `compare`): the
// in-memory host keeps every saved version, the history lists them, and picking one compares the
// document with it, block by block by element id. Changes show as change bars in the template's
// colors, or with the words and blocks that changed marked in place.

import type { Key } from '@flamboyantengineer/ui-components/core';
import {
  VersionHistory,
  type VersionHistoryVersion,
} from '@flamboyantengineer/ui-components/version-history';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { type ChangeBar, DocumentEditor } from '../../src/components/index.js';
import {
  createDocumentEditing,
  type VersionChangeDisplay,
  versionChanges,
} from '../../src/engine/index.js';
import { createMemoryHost, type DocumentVersion } from '../../src/host/index.js';
import {
  BASE_TEMPLATE,
  BASE_TEMPLATE_ID,
  createDocumentSchema,
  type DocumentFile,
  readDocumentFile,
  resolveTemplateFile,
  type StoredNode,
} from '../../src/model/index.js';
import { isPaginationTransaction } from '../../src/pagination/index.js';
import { heading, text } from './lab-document.js';
import { pagesLaidOut } from './lab-ready.js';

const TEMPLATE = resolveTemplateFile(BASE_TEMPLATE, {
  loadTemplate: (id) => (id === BASE_TEMPLATE_ID ? BASE_TEMPLATE : null),
  baseTemplateId: BASE_TEMPLATE_ID,
});

const SCHEMA = createDocumentSchema();
const DOCUMENT_ID = 'lab';

const line = (id: string, value: StoredNode[] | string): StoredNode => ({
  type: 'paragraph',
  attrs: { id },
  content: typeof value === 'string' ? [text(value)] : value,
});

const file = (...content: StoredNode[]): DocumentFile => ({
  formatVersion: 1,
  sections: [{ name: null, content: [heading(1, 'Scope'), ...content] }],
});

const FIRST = file(
  line('a0000001', 'The system shall report each fault within one second of detecting it.'),
  line('a0000002', 'Reports go to the operator console and to the log.'),
  line('a0000003', 'The log keeps every report for ninety days.'),
  line('a0000004', 'Operators may clear the log at any time.'),
);

const SECOND = file(
  line('a0000001', 'The system shall report each fault within two seconds of detecting it.'),
  line('a0000002', [
    text('Reports go to the '),
    { type: 'text', text: 'operator console', marks: [{ type: 'strong' }] },
    text(' and to the log.'),
  ]),
  line('a0000003', 'The log keeps every report for ninety days.'),
  line('a0000004', 'Operators may clear the log at any time.'),
);

const THIRD = file(
  line('a0000001', 'The system shall report each fault within two seconds of detecting it.'),
  line('a0000003', 'The log keeps each report for ninety days.'),
  line('a0000002', [
    text('Reports go to the '),
    { type: 'text', text: 'operator console', marks: [{ type: 'strong' }] },
    text(' and to the log.'),
  ]),
  line('a0000005', 'Each report names the fault and where it was detected.'),
);

const HOST = createMemoryHost({
  person: { id: 'ada', name: 'Ada Lovelace' },
  documents: [{ id: DOCUMENT_ID, content: FIRST }],
});

// Saves the second and third versions, so the history has three.
async function saveVersions() {
  await HOST.documents.save(DOCUMENT_ID, { content: SECOND, baseRevision: 'rev-1' });
  await HOST.documents.save(DOCUMENT_ID, { content: THIRD, baseRevision: 'rev-2' });
  const listed = await HOST.versions?.list(DOCUMENT_ID);
  return listed?.ok ? listed.value : [];
}

const initialState = () =>
  EditorState.create({
    doc: readDocumentFile(THIRD, SCHEMA),
    plugins: createDocumentEditing(SCHEMA, { template: () => TEMPLATE, author: () => 'ada' }),
  });

const toHistory = (version: DocumentVersion): VersionHistoryVersion => ({
  id: version.revision,
  label: version.label ?? `Version ${String(version.sequence)}`,
  time: version.savedAt,
  person: { name: 'Ada Lovelace' },
});

function Lab({ versions }: { versions: readonly DocumentVersion[] }) {
  const [state, setState] = useState(initialState);
  const [selected, setSelected] = useState<Key | null>(null);
  const [previous, setPrevious] = useState<ProseMirrorNode | null>(null);
  const [display, setDisplay] = useState<VersionChangeDisplay>('markup');
  const [bars, setBars] = useState<readonly ChangeBar[]>([]);
  useEffect(() => {
    if (selected === null) return;
    let current = true;
    void HOST.versions?.load(DOCUMENT_ID, String(selected)).then((loaded) => {
      if (current && loaded.ok) setPrevious(readDocumentFile(loaded.value, SCHEMA));
    });
    return () => {
      current = false;
    };
  }, [selected]);
  const changes = versionChanges(state);
  return (
    <div className="lab-layout">
      <div>
        <fieldset>
          <legend>Show changes as</legend>
          {(['markup', 'bars'] as const).map((value) => (
            <label key={value}>
              <input
                type="radio"
                name="display"
                value={value}
                checked={display === value}
                onChange={() => setDisplay(value)}
              />{' '}
              {value === 'markup' ? 'Marked text' : 'Change bars'}
            </label>
          ))}
          <output aria-label="Changes">
            {previous ? `${String(changes.length)} changes` : 'Pick a version to compare with'}
          </output>
          <output aria-label="Bars reported">{`${String(bars.length)} bars`}</output>
        </fieldset>
        <DocumentEditor
          state={state}
          onStateChange={setState}
          template={TEMPLATE}
          compare={previous ? { previous, display } : null}
          onChangeBarsChange={setBars}
          aria-label="Sample document"
          events={{
            onTransaction: (tr) => {
              if (isPaginationTransaction(tr)) pagesLaidOut();
            },
          }}
        />
      </div>
      <aside>
        <VersionHistory
          aria-label="Versions"
          versions={versions.map(toHistory)}
          currentKey={versions[0]?.revision ?? null}
          selectedKeys={selected === null ? [] : [selected]}
          showFilters={false}
          onSelectionChange={(keys) => {
            const next = [...keys].find((key) => key !== selected) ?? null;
            setSelected(next);
            if (next === null) setPrevious(null);
          }}
        />
      </aside>
    </div>
  );
}

const container = document.querySelector('#lab-editor');
if (container) {
  void saveVersions().then((versions) => createRoot(container).render(<Lab versions={versions} />));
}
