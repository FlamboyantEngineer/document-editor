// The document editor with every feature on, as a host would assemble it: the comments margin
// over the in-memory host's comment store, suggest mode and how suggestions show, proofing with two
// proofers, find and replace, zoom, the toolbar, status bar and scrolling frame, the host's own
// toolbar items, context menu entries and locked paragraph, collaborators' carets, an agent
// working through the automation API, figures and linked code through the host's assets and code
// source, references and abbreviations through its citations and glossary, and side panels beside
// the document: the outline and search at its start, the properties and the host's own panes at its
// end. The host's options (full-editor-options.tsx) and a review scope over the outline
// (review-scope.tsx) sit above it.

import { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  DocumentEditor,
  type DocumentEditorHandle,
  type DocumentMarkup,
  inlineCompletionItem,
} from '../../src/components/index.js';
import {
  assignElementIds,
  createAbbreviationHealth,
  createContents,
  createDocumentEditing,
  createInlineCompletion,
  createPresence,
  createProofing,
  createReferences,
  createReferenceStatus,
} from '../../src/engine/index.js';
import { createMemoryHost, createWordListProofer, type EditingMode } from '../../src/host/index.js';
import {
  BASE_TEMPLATE,
  BASE_TEMPLATE_ID,
  createDocumentSchema,
  readDocumentFile,
  resolveTemplateFile,
  type TemplateFile,
} from '../../src/model/index.js';
import { AgentPanel } from './agent-panel.js';
import { startCollaborators } from './collaborators.js';
import {
  citingPlaces,
  DEFAULT_OPTIONS,
  GLOSSARY_ENTRIES,
  HostOptionsPanel,
  INVALID_MATH,
  LAB_PIN,
  labRunner,
  MARKUP_REASONS,
  normalizeAnswer,
  proofingOptions,
  reportingPins,
  sampleBlocks,
  withRecordLinks,
} from './full-editor-options.js';
import { HOST_CONTEXT_MENU, isLockedParagraph } from './host-context-menu.js';
import { HOST_DIALOGS, NOTE_ITEM } from './host-dialogs.js';
import { labExports } from './host-exports.js';
import { hostMenubar } from './host-menubar.js';
import { HostPanel, useHostPanel } from './host-panel.js';
import { labPanels, RevealPanes } from './host-panes.js';
import { HOST_TOOLBAR } from './host-toolbar.js';
import {
  CATALOGUE_TYPE,
  CITATION_DIALOGS,
  CITATION_TARGETS,
  CITATIONS,
  citingParagraph,
  REFERENCE_KINDS,
} from './lab-citations.js';
import { chapter, heading, sampleDocument, text } from './lab-document.js';
import { labAssets, labDiagrams } from './lab-figures.js';
import { markReadyWhenSettled } from './lab-ready.js';
import { checkLabScript, LAB_SCRIPT_VOCABULARY, runLabScript } from './lab-scripts.js';
import { createReviewScope, ReviewScope } from './review-scope.js';
import { LAB_FONTS } from './served-fonts.js';

// The base template with a landscape appendix, so pages of two orientations hold comments.
const LAB_TEMPLATE: TemplateFile = {
  formatVersion: 1,
  id: 'full-editor',
  parent: BASE_TEMPLATE_ID,
  sections: [
    {
      name: 'appendix',
      label: 'Appendix',
      insertable: true,
      restartNumbering: true,
      page: { size: 'A4', orientation: 'landscape' },
      styles: {
        heading1: { numbering: { format: 'A.' } },
        heading2: { numbering: { format: 'A.1.' } },
      },
    },
  ],
};

const TEMPLATE = resolveTemplateFile(LAB_TEMPLATE, {
  loadTemplate: (id) => (id === BASE_TEMPLATE_ID ? BASE_TEMPLATE : null),
  baseTemplateId: BASE_TEMPLATE_ID,
});

// A thread on one run of text, by its id.
const commented = (value: string, thread: string) => ({
  ...text(value),
  marks: [{ type: 'comment', attrs: { thread, state: 'open' } }],
});

// A thread of one comment, as the host's store keeps it.
const storedThread = (id: string, quote: string, author: string, comment: string) => ({
  id,
  state: 'open' as const,
  quote,
  suggestion: null,
  entries: [{ id: `${id}-1`, author, text: comment, createdAt: '2026-01-05T09:30:00Z' }],
});

// The source files the in-memory host's code source resolves linked code from.
const CODE = {
  'https://example.com/firmware/clock.ts': [
    'export function tick(now: number): number {',
    '  const elapsed = now - started;',
    '  return elapsed / PERIOD;',
    '}',
  ].join('\n'),
  // A whole file, longer than the dialog's preview shows at once.
  'https://example.com/firmware/schedule.ts': Array.from(
    { length: 120 },
    (_, index) => `export const slot${String(index + 1)} = ${String(index * 15)}; // minutes`,
  ).join('\n'),
};

// The glossary abbreviations cite, with an archived entry and two that read the same.
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
  ...GLOSSARY_ENTRIES,
];

// The key of what a script reads: the document's blocks, as the lab's scripts count them.
const inputsKey = ({ document }: { document: { sections: { content: unknown[] }[] } }) =>
  `blocks:${String(document.sections.reduce((sum, section) => sum + section.content.length, 0))}`;

const HOST = createMemoryHost({
  scripts: runLabScript,
  scriptVocabulary: LAB_SCRIPT_VOCABULARY,
  checkScript: checkLabScript,
  scriptInputsKey: inputsKey,
  code: CODE,
  glossary: GLOSSARY,
  citations: CITATIONS,
  citationTargets: CITATION_TARGETS,
  person: { id: 'ada', name: 'Ada Lovelace' },
  people: [{ id: 'grace', name: 'Grace Hopper' }],
  comments: {
    threads: {
      full: [
        storedThread(
          'c0ffee02',
          'Normal operation',
          'grace',
          'Does normal operation include start-up?',
        ),
        storedThread(
          'c0ffee03',
          'landscape pages',
          'grace',
          'This card sits beside the landscape page, at its own edge.',
        ),
        storedThread(
          'c0ffee04',
          'portrait pages again',
          'ada',
          'And this one beside the portrait page that follows.',
        ),
      ],
    },
  },
});

// The host's uploads beside a library of images to choose from, and diagrams drawn at once.
const ASSETS = HOST.assets && labAssets(HOST.assets);
const DIAGRAMS = ASSETS && labDiagrams(ASSETS);

// A provider that completes one sentence, as a language model would.
// Whether the writer suggests, which a taken completion follows.
const SUGGESTING = { current: false };
// Tells the reader what the references found, once the lab shows.
const NOTICES = { current: (message: string): void => void message };

const COMPLETER = {
  agent: 'lab-assistant',
  complete: ({ before }: { before: string }) =>
    Promise.resolve({
      ok: true as const,
      value: {
        // Two lines, which the library offers the first of and the host's normalising joins.
        text: before.endsWith('Recovery takes') ? ' less than one second.\nIt is logged.' : '',
        session: 'lab-completion',
      },
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
    schema: {
      assetPreviewUrl: (id: string) => ASSETS?.resolveUrl(id) ?? '',
      referenceTypes: [CATALOGUE_TYPE],
    },
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
    // Citations of other documents: one has an update, one names a target that is gone.
    citingParagraph(),
    // A script block showing the output saved with the document, which opening never reruns, and
    // one whose script the lab cannot run, which produced nothing yet.
    {
      type: 'script',
      attrs: {
        id: '5c41b7e1',
        source: 'render.paragraph(`Status: ${document.blocks} blocks.`)',
        refresh: 'open',
      },
      content: [{ type: 'paragraph', content: [text('Status: saved with the document.')] }],
    },
    { type: 'script', attrs: { id: '5c41b7e2', source: 'render.chart()' } },
    ...sampleBlocks(),
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
    // Text an agent generated in a session, which authorship shows apart from the writers' own.
    {
      type: 'paragraph',
      content: [
        text('A summary follows. '),
        {
          ...text('The agent drafted this sentence.'),
          marks: [{ type: 'contributor', attrs: { author: 'agent', aiSession: 'lab-session' } }],
        },
      ],
    },
  );
  // A landscape appendix, then the body again on portrait pages, each with a thread.
  file.sections.push(
    {
      name: 'appendix',
      content: [
        heading(1, 'Interface limits'),
        {
          type: 'paragraph',
          content: [
            text('The appendix is laid out on '),
            commented('landscape pages', 'c0ffee03'),
            text(', wider than the body, so its comments follow a page edge further out.'),
          ],
        },
        ...chapter('Limits').slice(1),
      ],
    },
    {
      name: null,
      content: [
        heading(1, 'Revision history'),
        {
          type: 'paragraph',
          content: [
            text('After the appendix the document returns to '),
            commented('portrait pages again', 'c0ffee04'),
            text('.'),
          ],
        },
      ],
    },
  );
  const state = EditorState.create({
    doc: readDocumentFile(file, schema).doc,
    plugins: [
      createContents({ template: () => TEMPLATE }),
      createReferences({
        template: () => TEMPLATE,
        onBroken: () => NOTICES.current('A reference lost its target'),
      }),
      ...(HOST.references
        ? [
            createReferenceStatus({
              source: HOST.references,
              delay: 100,
              onBroken: () => NOTICES.current('A cited document no longer holds a target'),
            }),
          ]
        : []),
      createInlineCompletion({
        provider: COMPLETER,
        normalize: normalizeAnswer,
        author: () => 'ada',
        delay: 300,
        suggesting: () => SUGGESTING.current,
      }),
      createProofing({ proofer: PROOFERS, delay: 200, ...proofingOptions() }),
      ...(HOST.glossary ? [createAbbreviationHealth({ glossary: HOST.glossary, delay: 200 })] : []),
      createReviewScope(),
      createPresence(),
      ...createDocumentEditing(schema, {
        template: () => TEMPLATE,
        author: () => 'ada',
        isLocked: isLockedParagraph,
        invalidMath: INVALID_MATH,
        citingPlaces: citingPlaces(),
      }),
    ],
  });
  const tr = state.tr;
  assignElementIds(tr, {});
  // The ids a document opens with are no edit of the writer's to undo.
  return state.apply(tr.setMeta('addToHistory', false));
}

// The host's toolbar with its note dialog, scrolling when the window is narrow.
const TOOLBAR = {
  ...HOST_TOOLBAR,
  items: [...(HOST_TOOLBAR.items ?? []), NOTE_ITEM, inlineCompletionItem()],
  optional: ['link', 'checklist'] as const,
  overflow: 'scroll' as const,
};

// The host's dialogs: its note and its catalogue references.
const DIALOGS = { ...HOST_DIALOGS, ...CITATION_DIALOGS };

// The host's notice on what its glossary may hold, which the abbreviation dialog shows.
const LABELS = { glossaryNotice: 'Glossary entries are shared by every document.' };

// Why the writer may not edit, while the lab restricts editing.
const RESTRICTED = { edit: 'The host lets this writer only suggest' };

// The context menu, a host record link keeping the selection.
const CONTEXT_MENU = withRecordLinks(HOST_CONTEXT_MENU);

function Lab() {
  const [state, setState] = useState(initialState);
  const [view, setView] = useState<EditorView | null>(null);
  const [mode, setMode] = useState<EditingMode>('edit');
  useEffect(() => {
    SUGGESTING.current = mode === 'suggest';
  }, [mode]);
  const [restricted, setRestricted] = useState(false);
  const [markup, setMarkup] = useState<DocumentMarkup>('all');
  const [zoom, setZoom] = useState(100);
  const [collaborators, setCollaborators] = useState(false);
  const [panels, setPanels] = useState(true);
  const [authorship, setAuthorship] = useState(false);
  const [markers, setMarkers] = useState(false);
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  // Each opening's options, read once as the document is given anew.
  const [opened, setOpened] = useState(DEFAULT_OPTIONS);
  // The template the last script run or export was given.
  const [templateGiven, setTemplateGiven] = useState('');
  const runner = useMemo(
    () => HOST.scripts && labRunner(HOST.scripts, opened.inputsKey, setTemplateGiven),
    [opened.inputsKey],
  );
  const handle = useRef<DocumentEditorHandle>(null);
  const host = useHostPanel(handle);
  // What the host's feedback last told the reader, such as a failed upload.
  const [notice, setNotice] = useState('');
  const [snapshot, setSnapshot] = useState('');
  useEffect(() => {
    NOTICES.current = setNotice;
  }, []);
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
  const exports = useMemo(
    () =>
      reportingPins(
        labExports((pages) => setSnapshot(`${String(pages)} pages printed`)),
        setTemplateGiven,
      ),
    [],
  );
  return (
    <>
      <div className="lab-controls">
        <fieldset>
          <legend>Mode</legend>
          <label>
            <input
              type="checkbox"
              name="suggesting"
              checked={mode === 'suggest'}
              onChange={(event) => setMode(event.currentTarget.checked ? 'suggest' : 'edit')}
            />{' '}
            Suggesting
          </label>
          <label>
            <input
              type="checkbox"
              name="restricted"
              checked={restricted}
              onChange={(event) => setRestricted(event.currentTarget.checked)}
            />{' '}
            Restrict editing
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
            Side panels
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
          <label>
            <input
              type="checkbox"
              name="markers"
              checked={markers}
              onChange={(event) => setMarkers(event.currentTarget.checked)}
            />{' '}
            Comment markers
          </label>
        </fieldset>
        <HostOptionsPanel
          options={options}
          onChange={setOptions}
          view={view}
          templateGiven={templateGiven}
          onOpenAgain={() => {
            setOpened(options);
            setState(initialState());
          }}
        />
        <ReviewScope state={state} view={view} template={TEMPLATE} />
        <AgentPanel view={view} />
        <HostPanel report={host.report} handle={handle} />
        <RevealPanes handle={handle} />
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
        fonts={LAB_FONTS}
        state={state}
        onStateChange={setState}
        template={TEMPLATE}
        editable={mode === 'edit' || mode === 'suggest'}
        suggesting={mode === 'suggest'}
        onModeChange={setMode}
        modeReasons={restricted ? RESTRICTED : undefined}
        author="ada"
        markup={markup}
        onMarkupChange={setMarkup}
        markupReasons={options.restrictMarkup ? MARKUP_REASONS : undefined}
        templatePin={options.templatePin ? LAB_PIN : undefined}
        refreshAbbreviationsOnOpen={opened.refreshAbbreviations}
        toolbar={TOOLBAR}
        dialogs={DIALOGS}
        labels={LABELS}
        referenceKinds={REFERENCE_KINDS}
        menubar={menubar}
        exports={exports}
        contextMenu={CONTEXT_MENU}
        scrollable
        statusBar
        authorship={authorship}
        find
        zoom={zoom}
        onZoomChange={setZoom}
        telemetry={host.telemetry}
        assets={ASSETS}
        diagrams={DIAGRAMS}
        codeSource={HOST.codeSource}
        referenceSource={HOST.references}
        glossary={HOST.glossary}
        scriptRunner={runner}
        feedback={feedback}
        handleRef={handle}
        {...host.notifications}
        comments={
          comments && {
            store: comments,
            documentId: 'full',
            identity: HOST.identity,
            canComment: mode !== 'read',
            presentation: markers ? 'markers' : 'cards',
          }
        }
        panels={
          panels ? labPanels({ template: TEMPLATE, onAuthorshipChange: setAuthorship }) : undefined
        }
        className="lab-document-editor"
        aria-label="Sample document"
        events={{
          onMounted: setView,
        }}
      ></DocumentEditor>
    </>
  );
}

const container = document.querySelector('#lab-editor');
if (container) {
  createRoot(container).render(<Lab />);
  markReadyWhenSettled();
}
