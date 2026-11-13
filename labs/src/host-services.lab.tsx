// The host's services that need a backend, mimicked in the browser so each can be tried by hand:
// embedded content the host keeps (`EmbedSourceAdapter`), changed, removed or denied at the host
// and taken in again; the host's variables in the page headers (`VariablesAdapter`), changed
// while the document is open; font loading (`FontsAdapter`) that is slow or fails; what the editor
// measures (`TelemetryAdapter`) and tells the reader (`FeedbackAdapter`), logged; and the editor's
// own lists a host replaces: the zoom levels, the symbol picker's characters and the code
// languages. Hiding the editor (`active`) keeps it showing what it last showed.

import { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DocumentEditor } from '../../src/components/index.js';
import {
  assignElementIds,
  createDocumentEditing,
  createEmbedStatus,
  embedStatusAt,
  insertEmbed,
  pasteEmbedsOfKinds,
  refreshEmbedStatus,
  updateEmbed,
} from '../../src/engine/index.js';
import type {
  EmbedContent,
  EmbedSourceAdapter,
  FeedbackAdapter,
  FontsAdapter,
  TelemetryAdapter,
  VariablesAdapter,
} from '../../src/host/index.js';
import {
  BASE_TEMPLATE,
  BASE_TEMPLATE_ID,
  createDocumentSchema,
  readDocumentFile,
  resolveTemplateFile,
  type StoredContent,
  type TemplateFile,
} from '../../src/model/index.js';
import { chapter, heading, text, variable } from './lab-document.js';
import { markReadyWhenSettled } from './lab-ready.js';

// A template whose header shows two of the host's variables and whose footer numbers the pages.
const LAB_TEMPLATE: TemplateFile = {
  formatVersion: 1,
  id: 'host-services',
  parent: BASE_TEMPLATE_ID,
  header: {
    content: [
      {
        type: 'paragraph',
        content: [variable('document.name'), text(' · '), variable('document.status')],
      },
    ],
  },
  footer: {
    content: [{ type: 'paragraph', content: [text('Page '), variable('page.current')] }],
  },
};

const TEMPLATE = resolveTemplateFile(LAB_TEMPLATE, {
  loadTemplate: (id) => (id === BASE_TEMPLATE_ID ? BASE_TEMPLATE : null),
  baseTemplateId: BASE_TEMPLATE_ID,
});

// ----- Embedded content, as a host's data service keeps it -----

const EMBED_KIND = 'data-set';

interface HostDataSet {
  label: string;
  revision: number;
  rows: readonly (readonly [string, string])[];
  removed: boolean;
  denied: boolean;
}

const table = (rows: readonly (readonly [string, string])[]): StoredContent => [
  {
    type: 'table',
    content: rows.map((row, index) => ({
      type: 'tableRow',
      content: row.map((cell) => ({
        type: index === 0 ? 'tableHeader' : 'tableCell',
        content: [{ type: 'paragraph', content: cell ? [text(cell)] : [] }],
      })),
    })),
  },
];

/** The lab's data service: data sets by id, which the controls change as another writer would. */
function createDataService(onChange: () => void) {
  const sets = new Map<string, HostDataSet>([
    [
      'limits',
      {
        label: 'Operating limits',
        revision: 1,
        rows: [
          ['Quantity', 'Limit'],
          ['Supply voltage', '28 V'],
          ['Temperature', '70 °C'],
        ],
        removed: false,
        denied: false,
      },
    ],
    [
      'timings',
      {
        label: 'Timings',
        revision: 1,
        rows: [
          ['Step', 'Duration'],
          ['Start-up', '2 s'],
        ],
        removed: false,
        denied: false,
      },
    ],
  ]);
  let failNext = false;
  const contentOf = (id: string, set: HostDataSet): EmbedContent => ({
    snapshot: `${id}@${String(set.revision)}`,
    label: set.label,
    content: table(set.rows),
  });
  const adapter: EmbedSourceAdapter = {
    kinds: [EMBED_KIND],
    resolve: (embeds) =>
      Promise.resolve({
        ok: true,
        value: embeds.map(({ source }) => {
          const set = sets.get(source);
          if (!set || set.removed) return null;
          if (set.denied) return 'no-access';
          return { snapshot: `${source}@${String(set.revision)}`, label: set.label };
        }),
      }),
    load: ({ source }) => {
      const set = sets.get(source);
      if (failNext) {
        failNext = false;
        return Promise.resolve({
          ok: false,
          error: { kind: 'unavailable', message: 'The data service is down' },
        });
      }
      if (!set || set.removed) return Promise.resolve({ ok: false, error: { kind: 'not-found' } });
      if (set.denied) return Promise.resolve({ ok: false, error: { kind: 'denied' } });
      return Promise.resolve({ ok: true, value: contentOf(source, set) });
    },
  };
  const change = (id: string, update: (set: HostDataSet) => HostDataSet) => {
    const set = sets.get(id);
    if (!set) return;
    sets.set(id, update(set));
    onChange();
  };
  return {
    adapter,
    ids: [...sets.keys()],
    describe: (id: string) => sets.get(id),
    content: (id: string) => {
      const set = sets.get(id);
      return set ? contentOf(id, set) : null;
    },
    addRow: (id: string) =>
      change(id, (set) => ({
        ...set,
        revision: set.revision + 1,
        rows: [...set.rows, [`Row ${String(set.rows.length)}`, `${String(set.revision + 1)}`]],
      })),
    toggleRemoved: (id: string) => change(id, (set) => ({ ...set, removed: !set.removed })),
    toggleDenied: (id: string) => change(id, (set) => ({ ...set, denied: !set.denied })),
    failNextLoad: () => {
      failNext = true;
    },
  };
}

// ----- Variables, as a host's document record keeps them -----

function createVariables(initial: Record<string, string>) {
  let values = { ...initial };
  const listeners = new Set<() => void>();
  const adapter: VariablesAdapter = {
    value: (key) => values[key],
    subscribe: (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    catalog: () => [
      { key: 'document.name', label: 'Document name' },
      { key: 'document.status', label: 'Document status' },
      { key: 'document.owner', label: 'Document owner' },
    ],
  };
  return {
    adapter,
    set: (key: string, value: string) => {
      values = { ...values, [key]: value };
      for (const listener of listeners) listener();
    },
  };
}

// ----- The lab -----

type FontBehaviour = 'load' | 'slow' | 'fail';

const ZOOM_LEVELS = [50, 80, 100, 125, 175, 250];

const SYMBOLS = [
  {
    id: 'units',
    label: 'Units',
    characters: [
      { char: '°', name: 'Degree sign' },
      { char: 'Ω', name: 'Ohm sign' },
      { char: 'µ', name: 'Micro sign' },
      { char: '±', name: 'Plus-minus sign' },
    ],
  },
  {
    id: 'arrows',
    label: 'Arrows',
    characters: [
      { char: '→', name: 'Rightwards arrow' },
      { char: '⇒', name: 'Rightwards double arrow' },
    ],
  },
];

const CODE_LANGUAGES = ['typescript', 'python', 'json', 'c'];

function initialState(): EditorState {
  const schema = createDocumentSchema();
  const file = {
    formatVersion: 1 as const,
    sections: [
      {
        name: null,
        content: [
          heading(1, 'Data from the host'),
          {
            type: 'paragraph',
            content: [
              text('The table below is embedded from the host. Change it at the host, then take '),
              text('the update; remove it or deny access to see how the editor marks it.'),
            ],
          },
          {
            type: 'embed',
            attrs: {
              kind: EMBED_KIND,
              source: 'limits',
              snapshot: 'limits@1',
              label: 'Operating limits',
            },
            content: table([
              ['Quantity', 'Limit'],
              ['Supply voltage', '28 V'],
              ['Temperature', '70 °C'],
            ]),
          },
          ...chapter('Interfaces'),
        ],
      },
    ],
  };
  const state = EditorState.create({
    doc: readDocumentFile(file, schema).doc,
    plugins: [
      createEmbedStatus({ source: DATA.adapter, delay: 200 }),
      ...createDocumentEditing(schema, {
        template: () => TEMPLATE,
        author: () => 'lab',
        pasteFilters: [pasteEmbedsOfKinds(DATA.adapter.kinds)],
      }),
    ],
  });
  const tr = state.tr;
  assignElementIds(tr, {});
  return state.apply(tr.setMeta('addToHistory', false));
}

// What the host changed, which the lab's controls show.
let hostChanged: () => void = () => undefined;
const DATA = createDataService(() => hostChanged());
const VARIABLES = createVariables({
  'document.name': 'Interface control document',
  'document.status': 'Draft',
  'document.owner': 'Ada Lovelace',
});

function Lab() {
  const [state, setState] = useState(initialState);
  const [view, setView] = useState<EditorView | null>(null);
  const [, setHostRevision] = useState(0);
  const [name, setName] = useState('Interface control document');
  const [status, setStatus] = useState('Draft');
  const [fontBehaviour, setFontBehaviour] = useState<FontBehaviour>('load');
  const [active, setActive] = useState(true);
  const [zoom, setZoom] = useState(100);
  const [log, setLog] = useState<string[]>([]);
  const [notices, setNotices] = useState<string[]>([]);
  const [embedReport, setEmbedReport] = useState('');
  useEffect(() => {
    hostChanged = () => setHostRevision((revision) => revision + 1);
    return () => {
      hostChanged = () => undefined;
    };
  }, []);
  const record = (entry: string) => setLog((entries) => [entry, ...entries].slice(0, 12));
  const fonts = useMemo<FontsAdapter>(
    () => ({
      load: (families, { timeout }) => {
        record(`fonts: load ${families.join(', ')} (timeout ${String(timeout)} ms)`);
        if (fontBehaviour === 'fail') {
          return Promise.resolve({
            ok: false,
            error: { kind: 'unavailable', message: 'No fonts' },
          });
        }
        const wait = fontBehaviour === 'slow' ? 2000 : 0;
        return new Promise((resolve) =>
          setTimeout(() => resolve({ ok: true, value: families }), wait),
        );
      },
    }),
    // A new adapter is a new font request, which the pages wait for again.
    [fontBehaviour],
  );
  const telemetry = useMemo<TelemetryAdapter>(
    () => ({
      measure: (metric, duration) =>
        record(`measure: ${metric} ${String(Math.round(duration))} ms`),
      count: (metric, value) => record(`count: ${metric} ${String(value)}`),
    }),
    [],
  );
  const feedback = useMemo<FeedbackAdapter>(
    () => ({
      notify: ({ tone, text: message }) =>
        setNotices((list) => [`${tone}: ${message}`, ...list].slice(0, 5)),
    }),
    [],
  );
  const insert = (id: string) => {
    const loaded = DATA.content(id);
    if (!view || !loaded) return;
    insertEmbed({ kind: EMBED_KIND, source: id, ...loaded })(view.state, view.dispatch);
    view.focus();
  };
  const takeUpdate = async () => {
    if (!view) return;
    const taken = await updateEmbed(view, DATA.adapter);
    setEmbedReport(taken ? 'Update taken' : 'Nothing taken: select an embed with an update');
  };
  const selectedStatus = embedStatusAt(state);
  return (
    <>
      <div className="lab-controls">
        <fieldset>
          <legend>Embedded data (host)</legend>
          {DATA.ids.map((id) => {
            const set = DATA.describe(id);
            return (
              <div key={id} role="group" aria-label={set?.label}>
                <strong>{set?.label}</strong> revision {set?.revision}
                {set?.removed ? ', removed' : ''}
                {set?.denied ? ', access denied' : ''}{' '}
                <button type="button" onClick={() => insert(id)}>
                  Insert {set?.label}
                </button>{' '}
                <button type="button" onClick={() => DATA.addRow(id)}>
                  Change {set?.label} at the host
                </button>{' '}
                <button type="button" onClick={() => DATA.toggleRemoved(id)}>
                  {set?.removed ? 'Restore' : 'Remove'} {set?.label} at the host
                </button>{' '}
                <button type="button" onClick={() => DATA.toggleDenied(id)}>
                  {set?.denied ? 'Allow' : 'Deny'} access to {set?.label}
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => view && refreshEmbedStatus(view.state, view.dispatch)}
          >
            Check embeds with the host
          </button>{' '}
          <button type="button" onClick={() => void takeUpdate()}>
            Take the selected embed&apos;s update
          </button>{' '}
          <button type="button" onClick={DATA.failNextLoad}>
            Fail the next load
          </button>
          <output aria-label="Embed report">
            Selected embed: {selectedStatus ?? 'none or current'}
            {embedReport ? ` · ${embedReport}` : ''}
          </output>
        </fieldset>
        <fieldset>
          <legend>Variables (host)</legend>
          <label>
            Name in the header{' '}
            <input
              value={name}
              onChange={(event) => {
                setName(event.currentTarget.value);
                VARIABLES.set('document.name', event.currentTarget.value);
              }}
            />
          </label>{' '}
          <label>
            Status in the header{' '}
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.currentTarget.value);
                VARIABLES.set('document.status', event.currentTarget.value);
              }}
            >
              <option>Draft</option>
              <option>In review</option>
              <option>Released</option>
            </select>
          </label>
        </fieldset>
        <fieldset>
          <legend>Fonts and view</legend>
          <label>
            Fonts{' '}
            <select
              value={fontBehaviour}
              onChange={(event) => setFontBehaviour(event.currentTarget.value as FontBehaviour)}
            >
              <option value="load">Load at once</option>
              <option value="slow">Load in 2 seconds</option>
              <option value="fail">Fail to load</option>
            </select>
          </label>{' '}
          <label>
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.currentTarget.checked)}
            />{' '}
            Editor active
          </label>
        </fieldset>
        <fieldset>
          <legend>What the editor told the host</legend>
          <ol aria-label="Host log">
            {log.map((entry, index) => (
              <li key={`${String(index)}-${entry}`}>{entry}</li>
            ))}
          </ol>
          <ol aria-label="Host feedback">
            {notices.map((entry, index) => (
              <li key={`${String(index)}-${entry}`}>{entry}</li>
            ))}
          </ol>
        </fieldset>
      </div>
      <DocumentEditor
        state={state}
        onStateChange={setState}
        template={TEMPLATE}
        author="lab"
        toolbar
        menubar
        statusBar
        contextMenu
        find
        active={active}
        zoom={zoom}
        onZoomChange={setZoom}
        zoomLevels={ZOOM_LEVELS}
        fonts={fonts}
        variables={VARIABLES.adapter}
        telemetry={telemetry}
        feedback={feedback}
        symbols={SYMBOLS}
        codeLanguages={CODE_LANGUAGES}
        aria-label="Sample document"
        events={{ onMounted: setView }}
      />
    </>
  );
}

const container = document.querySelector('#lab-editor');
if (container) {
  createRoot(container).render(<Lab />);
  markReadyWhenSettled();
}
