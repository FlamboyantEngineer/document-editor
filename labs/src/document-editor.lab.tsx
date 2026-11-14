// Shows the document editor component (`DocumentEditor`): a sample document in the base template,
// with the editing keys and a table of contents, shown on pages or in the web layout and switched
// between authoring and reading without losing its state, with or without its toolbar, its
// scrolling frame and its status bar, which shows the page in view. Right-click anywhere in the
// document for its context menu, and hover a table for the handles that drag its rows and columns.
// The scrolling frame shows an overview of the proofing issues and changes. The lab adds its own
// toolbar items, a lead, a placeholder and a banner and arranges the status bar, as a host does
// (`host-toolbar.tsx`). A word-list proofer marks a few misspellings and
// a grammar slip, which the context menu corrects.

import { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  DocumentEditor,
  type DocumentEditorDebug,
  type DocumentEditorHandle,
  type DocumentLayout,
  type DocumentMarkup,
  type DocumentStatusBarOptions,
} from '../../src/components/index.js';
import {
  assignElementIds,
  createContents,
  createDocumentEditing,
  createPresence,
  createProofing,
} from '../../src/engine/index.js';
import { createWordListProofer } from '../../src/host/index.js';
import {
  BASE_TEMPLATE,
  BASE_TEMPLATE_ID,
  createDocumentSchema,
  readDocumentFile,
  resolveTemplateFile,
} from '../../src/model/index.js';
import { AgentPanel } from './agent-panel.js';
import { startCollaborators } from './collaborators.js';
import { HOST_CONTEXT_MENU, isLockedParagraph } from './host-context-menu.js';
import { HostPanel, useHostPanel } from './host-panel.js';
import { HOST_TOOLBAR } from './host-toolbar.js';
import { sampleDocument } from './lab-document.js';
import { markReadyWhenSettled } from './lab-ready.js';

const TEMPLATE = resolveTemplateFile(BASE_TEMPLATE, {
  loadTemplate: (id) => (id === BASE_TEMPLATE_ID ? BASE_TEMPLATE : null),
  baseTemplateId: BASE_TEMPLATE_ID,
});

// A proofer that knows a few misspellings, in English and French, and one grammar rule, and an
// abbreviation checker beside it, standing in for the host's.
const PROOFER = createWordListProofer({
  corrections: { teh: ['the', 'ten'], recieve: ['receive'], seperate: ['separate'] },
  byLanguage: { fr: { operation: ['opération'] } },
  languages: [
    { id: 'en', label: 'English' },
    { id: 'fr', label: 'French' },
  ],
  grammar: { 'a error': { message: 'Use "an" before a vowel sound.', suggestions: ['an error'] } },
});
const ABBREVIATIONS = createWordListProofer({
  corrections: { tbd: ['to be decided'] },
  kind: 'style',
});

function initialState(): EditorState {
  const schema = createDocumentSchema();
  const file = sampleDocument(['Scope', 'Interfaces', 'Timing', 'Power']);
  file.sections[0]?.content.unshift({ type: 'contents', attrs: { kind: 'toc', depth: 2 } });
  // Closing paragraphs for the proofer to mark and for the lock to freeze, after the chapters so
  // they move none of them.
  file.sections[0]?.content.push({
    type: 'paragraph',
    content: [
      { type: 'text', text: 'Locked by its workflow state: this paragraph cannot change.' },
    ],
  });
  file.sections[0]?.content.push({
    type: 'paragraph',
    content: [
      {
        type: 'text',
        text: 'Right-click a marked word: teh proofer suggests a fix, and a error in grammar is marked too. Writers recieve every suggestion in the menu. Details are TBD, teh team says.',
      },
    ],
  });
  const state = EditorState.create({
    doc: readDocumentFile(file, schema).doc,
    plugins: [
      createContents({ template: () => TEMPLATE }),
      createProofing({ proofer: [PROOFER, ABBREVIATIONS], language: 'en', delay: 200 }),
      createPresence(),
      ...createDocumentEditing(schema, {
        template: () => TEMPLATE,
        author: () => 'lab',
        isLocked: isLockedParagraph,
        // A host's remapping: strikethrough moves from Mod-Shift-S.
        shortcuts: { strikethrough: 'Mod-Shift-x' },
      }),
    ],
  });
  const tr = state.tr;
  assignElementIds(tr, {});
  // The ids a document opens with are no edit of the writer's to undo.
  return state.apply(tr.setMeta('addToHistory', false));
}

// The host's arrangement of the status bar: the mode moved to the end, and the document's state.
const HOST_STATUS_BAR: DocumentStatusBarOptions = {
  arrange: (items) => [
    ...items.filter((item) => item.id !== 'mode'),
    ...items
      .filter((item) => item.id === 'mode')
      .map((item) => ({ ...item, side: 'end' as const })),
    { id: 'workflow', side: 'end', content: 'Draft' },
  ],
};

// The layout debugging's parts, each with a checkbox.
const DEBUG_PARTS = [
  { part: 'pages', label: 'Layout debugging' },
  { part: 'blocks', label: 'Block heights' },
  { part: 'measure', label: 'Measuring view' },
] as const;

function Lab() {
  const [state, setState] = useState(initialState);
  const [layout, setLayout] = useState<DocumentLayout>('page');
  const [editable, setEditable] = useState(true);
  const [toolbar, setToolbar] = useState(true);
  const [scrollable, setScrollable] = useState(true);
  const [debug, setDebug] = useState<DocumentEditorDebug>({});
  const [statusBar, setStatusBar] = useState(true);
  const [selectionToolbar, setSelectionToolbar] = useState(false);
  const [hostItems, setHostItems] = useState(true);
  const [banner, setBanner] = useState(false);
  const [view, setView] = useState<EditorView | null>(null);
  const handle = useRef<DocumentEditorHandle>(null);
  const host = useHostPanel();
  const [collaborators, setCollaborators] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [markup, setMarkup] = useState<DocumentMarkup>('all');
  useEffect(
    () => (view && collaborators ? startCollaborators(view) : undefined),
    [view, collaborators],
  );
  return (
    <>
      <div className="lab-controls">
        <fieldset>
          <legend>View</legend>
          {(['page', 'web'] as const).map((value) => (
            <label key={value}>
              <input
                type="radio"
                name="layout"
                value={value}
                checked={layout === value}
                onChange={() => setLayout(value)}
              />{' '}
              {value === 'page' ? 'Pages' : 'Web layout'}
            </label>
          ))}
          <label>
            <input
              type="checkbox"
              name="authoring"
              checked={editable}
              onChange={(event) => setEditable(event.currentTarget.checked)}
            />{' '}
            Authoring
          </label>
          <label>
            <input
              type="checkbox"
              name="toolbar"
              checked={toolbar}
              onChange={(event) => setToolbar(event.currentTarget.checked)}
            />{' '}
            Toolbar
          </label>
          <label>
            <input
              type="checkbox"
              name="scrollable"
              checked={scrollable}
              onChange={(event) => setScrollable(event.currentTarget.checked)}
            />{' '}
            Scrolling frame
          </label>
          <label>
            <input
              type="checkbox"
              name="selection-toolbar"
              checked={selectionToolbar}
              onChange={(event) => setSelectionToolbar(event.currentTarget.checked)}
            />{' '}
            Selection toolbar
          </label>
          {DEBUG_PARTS.map(({ part, label }) => (
            <label key={part}>
              <input
                type="checkbox"
                name={`debug-${part}`}
                checked={debug[part] ?? false}
                onChange={(event) => {
                  const { checked } = event.currentTarget;
                  setDebug((current) => ({ ...current, [part]: checked }));
                }}
              />{' '}
              {label}
            </label>
          ))}
          <label>
            <input
              type="checkbox"
              name="status-bar"
              checked={statusBar}
              onChange={(event) => setStatusBar(event.currentTarget.checked)}
            />{' '}
            Status bar
          </label>
          <label>
            <input
              type="checkbox"
              name="host-items"
              checked={hostItems}
              onChange={(event) => setHostItems(event.currentTarget.checked)}
            />{' '}
            Host items
          </label>
          <label>
            <input
              type="checkbox"
              name="banner"
              checked={banner}
              onChange={(event) => setBanner(event.currentTarget.checked)}
            />{' '}
            Banner
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
        </fieldset>
        <AgentPanel view={view} />
        <HostPanel report={host.report} handle={handle} />
      </div>
      <DocumentEditor
        state={state}
        onStateChange={setState}
        template={TEMPLATE}
        layout={layout}
        onLayoutChange={setLayout}
        editable={editable}
        toolbar={toolbar && (hostItems ? HOST_TOOLBAR : true)}
        scrollable={scrollable}
        selectionToolbar={selectionToolbar}
        debug={debug}
        statusBar={statusBar && (hostItems ? HOST_STATUS_BAR : true)}
        lead={hostItems ? <p className="lab-lead">Sample document · draft</p> : undefined}
        placeholder={<p>Laying out the pages…</p>}
        overview
        banners={
          banner
            ? [
                {
                  id: 'review',
                  tone: 'info',
                  title: 'In review',
                  description: 'Reviewers are reading this version.',
                  onDismiss: () => setBanner(false),
                },
              ]
            : undefined
        }
        find
        repairIds
        zoom={zoom}
        onZoomChange={setZoom}
        markup={markup}
        telemetry={host.telemetry}
        contextMenu={hostItems ? HOST_CONTEXT_MENU : true}
        className="lab-document-editor"
        aria-label="Sample document"
        handleRef={handle}
        {...host.notifications}
        events={{
          onMounted: setView,
        }}
      />
    </>
  );
}

const container = document.querySelector('#lab-editor');
if (container) {
  createRoot(container).render(<Lab />);
  markReadyWhenSettled();
}
