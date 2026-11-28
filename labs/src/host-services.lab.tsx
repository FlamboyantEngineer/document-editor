// The host's services that need a backend, mimicked in the browser so each can be tried by hand:
// embedded content the host keeps (`EmbedSourceAdapter`), changed, removed or denied at the host
// and taken in again; the host's variables in the page headers (`VariablesAdapter`), changed
// while the document is open; font loading (`FontsAdapter`) that is slow or fails; what the editor
// measures (`TelemetryAdapter`) and tells the reader (`FeedbackAdapter`), logged; and the editor's
// own lists a host replaces: the zoom levels, the symbol picker's characters and the code
// languages. Hiding the editor (`active`) keeps it showing what it last showed. Embeds can be pinned
// to the state they show and repinned from the context menu (`setEmbedPinned`); a linked
// spreadsheet range is embedded through the bridge (`createLinkedSpreadsheetAdapter`); the fonts can
// miss the editor's `fontTimeout`, which `onLayoutFailed` logs; and the math typesetter can stop
// answering, so math shows invalid with the host's reason (`math.timeoutMessage`).

import { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DocumentEditor } from '../../src/components/index.js';
import {
  assignElementIds,
  createDocumentEditing,
  createEmbedStatus,
  embedAt,
  embedStatusAt,
  insertEmbed,
  pasteEmbedsOfKinds,
  refreshEmbedStatus,
  setEmbedPinned,
  updateEmbed,
} from '../../src/engine/index.js';
import type {
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
  type TemplateFile,
} from '../../src/model/index.js';
import {
  combineSources,
  createDataService,
  createSpreadsheetService,
  EMBED_KIND,
  table,
} from './host-data.js';
import { embedMenu, LAB_MATH, MathControls, SheetControls } from './host-embed-controls.js';
import { chapter, heading, text, variable } from './lab-document.js';
import { markReadyWhenSettled } from './lab-ready.js';
import { LAB_FONTS } from './served-fonts.js';

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
  // An appendix whose tables take their own colors, so an embedded table there takes them too.
  sections: [
    {
      name: 'appendix',
      styles: {
        table: {
          border: { color: '#b45309' },
          header: { background: '#fef3c7', color: '#78350f' },
        },
      },
    },
  ],
};

const TEMPLATE = resolveTemplateFile(LAB_TEMPLATE, {
  loadTemplate: (id) => (id === BASE_TEMPLATE_ID ? BASE_TEMPLATE : null),
  baseTemplateId: BASE_TEMPLATE_ID,
});

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

type FontBehaviour = 'load' | 'slow' | 'late' | 'fail';

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
      {
        name: 'appendix',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [
              text('Timings within '),
              {
                type: 'embed_inline',
                attrs: { kind: EMBED_KIND, source: 'limits', snapshot: 'limits@1', text: '28 V' },
              },
            ],
          },
          {
            type: 'embed',
            attrs: {
              kind: EMBED_KIND,
              source: 'timings',
              snapshot: 'timings@1',
              label: 'Timings',
            },
            content: table([
              ['Step', 'Duration'],
              ['Start-up', '2 s'],
            ]),
          },
        ],
      },
    ],
  };
  const state = EditorState.create({
    doc: readDocumentFile(file, schema).doc,
    plugins: [
      createEmbedStatus({ source: SOURCE, delay: 200 }),
      ...createDocumentEditing(schema, {
        template: () => TEMPLATE,
        author: () => 'lab',
        pasteFilters: [pasteEmbedsOfKinds(SOURCE.kinds)],
        math: LAB_MATH,
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
const SHEET = createSpreadsheetService(() => hostChanged());
// The one source the embed status and updates ask, each embed of the service of its kind.
const SOURCE = combineSources(DATA.adapter, SHEET.adapter);
const EMBED_MENU = embedMenu(SOURCE);
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
  const [fontTimeout, setFontTimeout] = useState(5000);
  // Each opening of the editor, which waits for the fonts before it first shows the pages.
  const [opening, setOpening] = useState(0);
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
  const record = (entry: string) => setLog((entries) => [entry, ...entries].slice(0, 40));
  // The lab's served files and shaper lay the pages out; `load` answers as the behaviour chosen.
  const fonts = useMemo<FontsAdapter>(
    () => ({
      ...LAB_FONTS,
      load: (families, { timeout }) => {
        record(`fonts: load ${families.join(', ')} (timeout ${String(timeout)} ms)`);
        if (fontBehaviour === 'fail') {
          return Promise.resolve({
            ok: false,
            error: { kind: 'unavailable', message: 'No fonts' },
          });
        }
        // As a host's font loading does, it gives up after `timeout`, with no family loaded.
        const wait = { load: 0, slow: 2000, late: 8000 }[fontBehaviour];
        const loaded = wait <= timeout ? families : [];
        return new Promise((resolve) =>
          setTimeout(() => resolve({ ok: true, value: loaded }), Math.min(wait, timeout)),
        );
      },
    }),
    // A new adapter is a new font request, which the editor makes again.
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
    const taken = await updateEmbed(view, SOURCE);
    setEmbedReport(taken ? 'Update taken' : 'Nothing taken: select an embed with an update');
  };
  const selectedStatus = embedStatusAt(state);
  const selected = embedAt(state);
  const selectedPinned = selected?.node.attrs.pinned === true;
  const pinSelected = () => {
    if (!view || !selected) return;
    setEmbedPinned(selected.pos, !selectedPinned)(view.state, view.dispatch);
  };
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
          </button>{' '}
          <button type="button" onClick={pinSelected} disabled={!selected}>
            {selectedPinned
              ? 'Let the selected embed follow its content'
              : 'Pin the selected embed'}
          </button>
          <output aria-label="Embed report">
            Selected embed: {selectedStatus ?? 'none or current'}
            {selectedPinned ? ', pinned' : ''}
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
              <option value="late">Load in 8 seconds</option>
              <option value="fail">Fail to load</option>
            </select>
          </label>{' '}
          <label>
            Font timeout{' '}
            <select
              value={fontTimeout}
              onChange={(event) => setFontTimeout(Number(event.currentTarget.value))}
            >
              <option value={5000}>5 seconds (the default)</option>
              <option value={1000}>1 second</option>
              <option value={12000}>12 seconds</option>
            </select>
          </label>{' '}
          <button type="button" onClick={() => setOpening((count) => count + 1)}>
            Open the editor again
          </button>{' '}
          <label>
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.currentTarget.checked)}
            />{' '}
            Editor active
          </label>
        </fieldset>
        <SheetControls sheet={SHEET} view={view} />
        <MathControls view={view} />
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
        contextMenu={EMBED_MENU}
        find
        active={active}
        zoom={zoom}
        onZoomChange={setZoom}
        zoomLevels={ZOOM_LEVELS}
        fonts={fonts}
        fontTimeout={fontTimeout}
        onLayoutFailed={() => record('layout failed: the pages are not shown')}
        variables={VARIABLES.adapter}
        telemetry={telemetry}
        feedback={feedback}
        symbols={SYMBOLS}
        codeLanguages={CODE_LANGUAGES}
        aria-label="Sample document"
        events={{ onMounted: setView }}
        key={opening}
      />
    </>
  );
}

const container = document.querySelector('#lab-editor');
if (container) {
  createRoot(container).render(<Lab />);
  markReadyWhenSettled();
}
