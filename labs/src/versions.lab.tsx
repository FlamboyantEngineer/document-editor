// Shows a document's changes from an older version (the document editor's `compare`): the
// in-memory host keeps every saved version, the history lists them, and picking one compares the
// document with it, block by block by element id. Changes show as change bars in the template's
// colors, or with the words and blocks that changed marked in place. Two versions picked and
// compared show the newer, read-only, with its changes since the older; a comparison scoped to a
// heading shows only the changes in its section, with their counts, the rest dimmed.

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
  versionChangeCounts,
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
import { text } from './lab-document.js';
import { markReadyWhenSettled } from './lab-ready.js';

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

const heading = (id: string, value: string): StoredNode => ({
  type: 'heading',
  attrs: { id, level: 1 },
  content: [text(value)],
});

// Every version ends with a retention section, whose rule the newest version changes.
const file = (retention: string, ...content: StoredNode[]): DocumentFile => ({
  formatVersion: 1,
  sections: [
    {
      name: null,
      content: [
        heading('h0000001', 'Scope'),
        ...content,
        heading('h0000002', 'Retention'),
        line('a0000007', retention),
      ],
    },
  ],
});

// A paragraph of several lines, of which the newest version changes the last.
const RECORD =
  'Each fault record holds the time it was detected, the unit that detected it, the operating state at that time, the readings that led to it and the action the system took in response, so that the record alone explains what happened.';

const FIRST = file(
  'Records are kept.',
  line('a0000001', 'The system shall report each fault within one second of detecting it.'),
  line('a0000002', 'Reports go to the operator console and to the log.'),
  line('a0000003', 'The log keeps every report for ninety days.'),
  line('a0000004', 'Operators may clear the log at any time.'),
  line('a0000006', RECORD),
);

const SECOND = file(
  'Records are kept.',
  line('a0000001', 'The system shall report each fault within two seconds of detecting it.'),
  line('a0000002', [
    text('Reports go to the '),
    { type: 'text', text: 'operator console', marks: [{ type: 'strong' }] },
    text(' and to the log.'),
  ]),
  line('a0000003', 'The log keeps every report for ninety days.'),
  line('a0000004', 'Operators may clear the log at any time.'),
  line('a0000006', RECORD),
);

const THIRD = file(
  'Records are kept for a year.',
  line('a0000001', 'The system shall report each fault within two seconds of detecting it.'),
  line('a0000003', 'The log keeps each report for ninety days.'),
  line('a0000002', [
    text('Reports go to the '),
    { type: 'text', text: 'operator console', marks: [{ type: 'strong' }] },
    text(' and to the log.'),
  ]),
  line('a0000005', 'Each report names the fault and where it was detected.'),
  line('a0000006', RECORD.replace('what happened', 'the fault')),
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

const stateOf = (content: DocumentFile) =>
  EditorState.create({
    doc: readDocumentFile(content, SCHEMA).doc,
    plugins: createDocumentEditing(SCHEMA, { template: () => TEMPLATE, author: () => 'ada' }),
  });

const SCOPES = [
  { id: '', label: 'Whole document' },
  { id: 'h0000001', label: 'Scope' },
  { id: 'h0000002', label: 'Retention' },
];

async function loadVersion(key: Key) {
  const loaded = await HOST.versions?.load(DOCUMENT_ID, String(key));
  return loaded?.ok ? loaded.value : null;
}

// Two versions compared: the newer, shown read-only, and the older it is compared with.
interface VersionPair {
  readonly newer: EditorState;
  readonly older: ProseMirrorNode;
}

const toHistory = (version: DocumentVersion): VersionHistoryVersion => ({
  id: version.revision,
  label: version.label ?? `Version ${String(version.sequence)}`,
  time: version.savedAt,
  person: { name: 'Ada Lovelace' },
});

function countsText(state: EditorState): string {
  const counts = versionChangeCounts(state);
  return [
    `${String(counts.insertion)} inserted`,
    `${String(counts.deletion)} deleted`,
    `${String(counts.modification)} modified`,
    `${String(counts.formatting)} formatted`,
    `${String(counts.move)} moved`,
  ].join(', ');
}

// The picked versions, last picked last, at most two: a third replaces the first.
function nextSelection(selected: readonly Key[], keys: Set<Key>): Key[] {
  const kept = selected.filter((key) => keys.has(key));
  const added = [...keys].filter((key) => !selected.includes(key));
  return [...kept, ...added].slice(-2);
}

function useComparedVersion(selected: readonly Key[]) {
  const [previous, setPrevious] = useState<ProseMirrorNode | null>(null);
  const last = selected.at(-1) ?? null;
  useEffect(() => {
    if (last === null) return;
    let current = true;
    void loadVersion(last).then((content) => {
      if (current && content) setPrevious(readDocumentFile(content, SCHEMA).doc);
    });
    return () => {
      current = false;
    };
  }, [last]);
  return last === null ? null : previous;
}

function Lab({ versions }: { versions: readonly DocumentVersion[] }) {
  const [edited, setEdited] = useState(() => stateOf(THIRD));
  const [pair, setPair] = useState<VersionPair | null>(null);
  const [selected, setSelected] = useState<readonly Key[]>([]);
  const [display, setDisplay] = useState<VersionChangeDisplay>('markup');
  const [scope, setScope] = useState('');
  const [bars, setBars] = useState<readonly ChangeBar[]>([]);
  const previous = useComparedVersion(selected);
  const state = pair?.newer ?? edited;
  const shown = pair ? pair.older : previous;
  const compareTwo = async ([older, newer]: [Key, Key]) => {
    const [olderContent, newerContent] = await Promise.all([
      loadVersion(older),
      loadVersion(newer),
    ]);
    if (!olderContent || !newerContent) return;
    setPair({ newer: stateOf(newerContent), older: readDocumentFile(olderContent, SCHEMA).doc });
  };
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
          <label>
            Compare within{' '}
            <select value={scope} onChange={(event) => setScope(event.target.value)}>
              {SCOPES.map(({ id, label }) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <output aria-label="Changes">
            {shown
              ? `${String(versionChanges(state).length)} changes`
              : 'Pick a version to compare with'}
          </output>
          <output aria-label="Counts">{shown ? countsText(state) : ''}</output>
          <output aria-label="Showing">{pair ? 'Two versions' : 'The document'}</output>
          <output aria-label="Bars reported">{`${String(bars.length)} bars`}</output>
        </fieldset>
        <DocumentEditor
          state={state}
          onStateChange={
            pair
              ? (update) =>
                  setPair({
                    ...pair,
                    newer: typeof update === 'function' ? update(pair.newer) : update,
                  })
              : setEdited
          }
          template={TEMPLATE}
          editable={!pair}
          compare={shown ? { previous: shown, display, scope: scope ? [scope] : undefined } : null}
          onChangeBarsChange={setBars}
          aria-label="Sample document"
        />
      </div>
      <aside>
        <VersionHistory
          aria-label="Versions"
          versions={versions.map(toHistory)}
          currentKey={versions[0]?.revision ?? null}
          selectedKeys={selected}
          showFilters={false}
          onSelectionChange={(keys) => {
            setSelected(nextSelection(selected, keys));
            setPair(null);
          }}
          onCompare={(keys) => void compareTwo(keys)}
        />
      </aside>
    </div>
  );
}

const container = document.querySelector('#lab-editor');
if (container) {
  void saveVersions().then((versions) => {
    createRoot(container).render(<Lab versions={versions} />);
    markReadyWhenSettled();
  });
}
