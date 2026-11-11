// The document editor with every feature on, as a host would assemble it: the comments margin
// over the in-memory host's comment store, suggest mode and how suggestions show, proofing with two
// proofers, find and replace, zoom, the toolbar, status bar and scrolling frame, the host's own
// toolbar items, context menu entries and locked paragraph, collaborators' carets, an agent
// working through the automation API, figures and linked code through the host's assets and code
// source, references and abbreviations through its citations and glossary, and the outline and
// search panels beside the document.

import { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  DocumentEditor,
  type DocumentEditorHandle,
  type DocumentMarkup,
  DocumentOutline,
  DocumentSearchPane,
} from '../../src/components/index.js';
import {
  assignElementIds,
  createContents,
  createDocumentEditing,
  createEditLock,
  createInlineCompletion,
  createPresence,
  createProofing,
  createReferences,
} from '../../src/engine/index.js';
import { createMemoryHost, createWordListProofer } from '../../src/host/index.js';
import {
  BASE_TEMPLATE,
  BASE_TEMPLATE_ID,
  createDocumentSchema,
  readDocumentFile,
  resolveTemplateFile,
} from '../../src/model/index.js';
import { isPaginationTransaction } from '../../src/pagination/index.js';
import { AgentPanel } from './agent-panel.js';
import { startCollaborators } from './collaborators.js';
import { HOST_CONTEXT_MENU, isLockedParagraph } from './host-context-menu.js';
import { hostMenubar } from './host-menubar.js';
import { HostPanel, useHostPanel } from './host-panel.js';
import { HOST_TOOLBAR } from './host-toolbar.js';
import { sampleDocument, text } from './lab-document.js';
import { pagesLaidOut } from './lab-ready.js';
import { checkLabScript, LAB_SCRIPT_VOCABULARY, runLabScript } from './lab-scripts.js';

const TEMPLATE = resolveTemplateFile(BASE_TEMPLATE, {
  loadTemplate: (id) => (id === BASE_TEMPLATE_ID ? BASE_TEMPLATE : null),
  baseTemplateId: BASE_TEMPLATE_ID,
});

// The source files the in-memory host's code source resolves linked code from.
const CODE = {
  'https://example.com/firmware/clock.ts': [
    'export function tick(now: number): number {',
    '  const elapsed = now - started;',
    '  return elapsed / PERIOD;',
    '}',
  ].join('\n'),
};

// The glossary abbreviations cite, and a citation of another document the host finds.
const GLOSSARY = [
  {
    id: 'glossary-gse',
    abbreviation: 'GSE',
    expansion: 'Ground support equipment',
    archivedAt: null,
    createdBy: 'ada',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

const CITATIONS = [
  {
    refType: 'external-document',
    label: 'PWR-100 Power interface specification',
    baseline: {
      version: 1 as const,
      documentId: 'pwr-100',
      numbering: 'PWR-100',
      title: 'Power interface specification',
      revision: null,
      revisionLabel: '',
      target: null,
      defaultLabel: 'PWR-100',
    },
  },
];

const HOST = createMemoryHost({
  scripts: runLabScript,
  scriptVocabulary: LAB_SCRIPT_VOCABULARY,
  checkScript: checkLabScript,
  code: CODE,
  glossary: GLOSSARY,
  citations: CITATIONS,
  person: { id: 'ada', name: 'Ada Lovelace' },
  people: [{ id: 'grace', name: 'Grace Hopper' }],
  comments: {
    threads: {
      full: [
        {
          id: 'c0ffee02',
          state: 'open',
          quote: 'Normal operation',
          suggestion: null,
          entries: [
            {
              id: 'e1',
              author: 'grace',
              text: 'Does normal operation include start-up?',
              createdAt: '2026-01-05T09:30:00Z',
            },
          ],
        },
      ],
    },
  },
});

// A provider that completes one sentence, as a language model would.
const COMPLETER = {
  complete: ({ before }: { before: string }) =>
    Promise.resolve({
      ok: true as const,
      value: before.endsWith('Recovery takes') ? ' less than one second.' : '',
    }),
};

const PROOFERS = [
  createWordListProofer({
    corrections: { teh: ['the'], recieve: ['receive'] },
    grammar: {
      'a error': { message: 'Use "an" before a vowel sound.', suggestions: ['an error'] },
    },
  }),
  createWordListProofer({ corrections: { tbd: ['to be decided'] }, kind: 'style' }),
];

function initialState(): EditorState {
  // Uploaded figures show from the in-memory host's assets.
  const schema = createDocumentSchema({
    schema: { assetPreviewUrl: (id: string) => HOST.assets?.resolveUrl(id) ?? '' },
  });
  const file = sampleDocument(['Scope', 'Interfaces', 'Timing', 'Power']);
  const content = file.sections[0]?.content ?? [];
  content.unshift({ type: 'contents', attrs: { kind: 'toc', depth: 2 } });
  // The first list's first item carries a comment thread, and a later paragraph a suggestion.
  const list = content.find((block) => block.type === 'bulletList');
  const first = list?.content?.[0]?.content?.[0];
  if (first) {
    first.content = [
      {
        ...text('Normal operation'),
        marks: [{ type: 'comment', attrs: { thread: 'c0ffee02', state: 'open' } }],
      },
    ];
  }
  content.push(
    {
      type: 'paragraph',
      content: [
        text('The log keeps '),
        {
          ...text('every'),
          marks: [{ type: 'deletion', attrs: { id: 'a1b2c3d4', author: 'grace' } }],
        },
        {
          ...text('each'),
          marks: [{ type: 'insertion', attrs: { id: 'a1b2c3d4', author: 'grace' } }],
        },
        text(' report. Details are TBD, teh team says, and a error remains.'),
      ],
    },
    {
      type: 'paragraph',
      content: [text('Locked by its workflow state: this paragraph cannot change.')],
    },
    // A script block the host runs each time the document opens.
    {
      type: 'script',
      attrs: {
        id: '5c41b7e1',
        source: 'render.paragraph(`Status: ${document.blocks} blocks.`)',
        refresh: 'open',
      },
    },
    {
      type: 'paragraph',
      content: [
        text('Approved by '),
        {
          type: 'signature',
          attrs: {
            person: 'ada',
            label: 'Ada Lovelace',
            vector: {
              viewBox: { width: 100, height: 40 },
              paths: [{ d: 'M5 30 C20 5 40 35 60 10 S90 20 95 15', fill: false, strokeWidth: 2 }],
            },
          },
        },
      ],
    },
  );
  const state = EditorState.create({
    doc: readDocumentFile(file, schema),
    plugins: [
      createContents({ template: () => TEMPLATE }),
      createReferences({ template: () => TEMPLATE }),
      createInlineCompletion({ provider: COMPLETER, delay: 300 }),
      createProofing({ proofer: PROOFERS, delay: 200 }),
      createEditLock({ isLocked: isLockedParagraph }),
      createPresence(),
      ...createDocumentEditing(schema, { template: () => TEMPLATE, author: () => 'ada' }),
    ],
  });
  const tr = state.tr;
  assignElementIds(tr, {});
  // The ids a document opens with are no edit of the writer's to undo.
  return state.apply(tr.setMeta('addToHistory', false));
}

function Lab() {
  const [state, setState] = useState(initialState);
  const [view, setView] = useState<EditorView | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [markup, setMarkup] = useState<DocumentMarkup>('all');
  const [zoom, setZoom] = useState(100);
  const [collaborators, setCollaborators] = useState(false);
  const [panels, setPanels] = useState(false);
  const [authorship, setAuthorship] = useState(false);
  const handle = useRef<DocumentEditorHandle>(null);
  const host = useHostPanel();
  // What the host's feedback last told the reader, such as a failed upload.
  const [notice, setNotice] = useState('');
  const [snapshot, setSnapshot] = useState('');
  const feedback = useMemo(
    () => ({ notify: ({ text: message }: { text: string }) => setNotice(message) }),
    [],
  );
  useEffect(
    () => (view && collaborators ? startCollaborators(view) : undefined),
    [view, collaborators],
  );
  const comments = HOST.comments;
  const menubar = useMemo(() => hostMenubar(() => setNotice('Saved')), []);
  return (
    <>
      <div className="lab-controls">
        <fieldset>
          <legend>Mode</legend>
          <label>
            <input
              type="checkbox"
              name="suggesting"
              checked={suggesting}
              onChange={(event) => setSuggesting(event.currentTarget.checked)}
            />{' '}
            Suggesting
          </label>
          <label>
            Markup{' '}
            <select
              name="markup"
              value={markup}
              onChange={(event) => setMarkup(event.currentTarget.value as DocumentMarkup)}
            >
              <option value="all">All markup</option>
              <option value="simple">Simple markup</option>
              <option value="final">No markup</option>
              <option value="original">Original</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              name="collaborators"
              checked={collaborators}
              onChange={(event) => setCollaborators(event.currentTarget.checked)}
            />{' '}
            Collaborators
          </label>
          <label>
            <input
              type="checkbox"
              name="panels"
              checked={panels}
              onChange={(event) => setPanels(event.currentTarget.checked)}
            />{' '}
            Outline and search
          </label>
          <label>
            <input
              type="checkbox"
              name="authorship"
              checked={authorship}
              onChange={(event) => setAuthorship(event.currentTarget.checked)}
            />{' '}
            Authorship
          </label>
        </fieldset>
        <AgentPanel view={view} />
        <HostPanel report={host.report} handle={handle} />
        <button
          type="button"
          onClick={() => {
            const snapshot = handle.current?.exportSnapshot({ title: 'Sample document' }) ?? '';
            const pages = (snapshot.match(/class="pm-page[ "]/g) ?? []).length;
            setSnapshot(`${String(pages)} pages`);
          }}
        >
          Export a snapshot
        </button>
        <output aria-label="Snapshot">{snapshot}</output>
        <p role="status" aria-label="Host feedback">
          {notice}
        </p>
      </div>
      <DocumentEditor
        state={state}
        onStateChange={setState}
        template={TEMPLATE}
        suggesting={suggesting}
        author="ada"
        markup={markup}
        toolbar={HOST_TOOLBAR}
        menubar={menubar}
        contextMenu={HOST_CONTEXT_MENU}
        scrollable
        statusBar
        authorship={authorship}
        find
        zoom={zoom}
        onZoomChange={setZoom}
        telemetry={host.telemetry}
        assets={HOST.assets}
        codeSource={HOST.codeSource}
        referenceSource={HOST.references}
        glossary={HOST.glossary}
        scriptRunner={HOST.scripts}
        feedback={feedback}
        handleRef={handle}
        {...host.notifications}
        comments={
          comments && {
            store: comments,
            documentId: 'full',
            identity: HOST.identity,
            canComment: true,
          }
        }
        className="lab-document-editor"
        aria-label="Sample document"
        events={{
          onMounted: setView,
          onTransaction: (tr) => {
            if (isPaginationTransaction(tr)) pagesLaidOut();
          },
        }}
      >
        {panels ? (
          <aside className="lab-panels">
            <DocumentOutline template={TEMPLATE} aria-label="Document outline" />
            <DocumentSearchPane template={TEMPLATE} onClose={() => setPanels(false)} />
          </aside>
        ) : null}
      </DocumentEditor>
    </>
  );
}

const container = document.querySelector('#lab-editor');
if (container) createRoot(container).render(<Lab />);
