// Shows the document editor component (`DocumentEditor`): a sample document in the base template,
// with the editing keys and a table of contents, shown on pages or in the web layout and switched
// between authoring and reading without losing its state, with or without its toolbar, its
// scrolling frame and its status bar. Right-click anywhere in the document for its context menu, and hover a table
// for the handles that drag its rows and columns. The lab adds its own toolbar items, as a host
// does (`host-toolbar.tsx`). A word-list proofer marks a few misspellings and
// a grammar slip, which the context menu corrects.

import { EditorState } from 'prosemirror-state';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DocumentEditor, type DocumentLayout } from '../../src/components/index.js';
import {
  assignElementIds,
  createContents,
  createDocumentEditing,
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
import { isPaginationTransaction } from '../../src/pagination/index.js';
import { HOST_TOOLBAR } from './host-toolbar.js';
import { sampleDocument } from './lab-document.js';

const TEMPLATE = resolveTemplateFile(BASE_TEMPLATE, {
  loadTemplate: (id) => (id === BASE_TEMPLATE_ID ? BASE_TEMPLATE : null),
  baseTemplateId: BASE_TEMPLATE_ID,
});

// A proofer that knows a few misspellings and one grammar rule, standing in for the host's.
const PROOFER = createWordListProofer({
  corrections: { teh: ['the', 'ten'], recieve: ['receive'], seperate: ['separate'] },
  grammar: { 'a error': { message: 'Use "an" before a vowel sound.', suggestions: ['an error'] } },
});

function initialState(): EditorState {
  const schema = createDocumentSchema();
  const file = sampleDocument(['Scope', 'Interfaces', 'Timing', 'Power']);
  file.sections[0]?.content.unshift({ type: 'contents', attrs: { kind: 'toc', depth: 2 } });
  // A closing paragraph for the proofer to mark, after the chapters so it moves none of them.
  file.sections[0]?.content.push({
    type: 'paragraph',
    content: [
      {
        type: 'text',
        text: 'Right-click a marked word: teh proofer suggests a fix, and a error in grammar is marked too. Writers recieve every suggestion in the menu.',
      },
    ],
  });
  const state = EditorState.create({
    doc: readDocumentFile(file, schema),
    plugins: [
      createContents({ template: () => TEMPLATE }),
      createProofing({ proofer: PROOFER, delay: 200 }),
      ...createDocumentEditing(schema, { template: () => TEMPLATE, author: () => 'lab' }),
    ],
  });
  const tr = state.tr;
  assignElementIds(tr, {});
  // The ids a document opens with are no edit of the writer's to undo.
  return state.apply(tr.setMeta('addToHistory', false));
}

function Lab() {
  const [state, setState] = useState(initialState);
  const [layout, setLayout] = useState<DocumentLayout>('page');
  const [editable, setEditable] = useState(true);
  const [toolbar, setToolbar] = useState(true);
  const [scrollable, setScrollable] = useState(true);
  const [statusBar, setStatusBar] = useState(true);
  const [hostItems, setHostItems] = useState(true);
  return (
    <>
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
          Host toolbar items
        </label>
      </fieldset>
      <DocumentEditor
        state={state}
        onStateChange={setState}
        template={TEMPLATE}
        layout={layout}
        editable={editable}
        toolbar={toolbar && (hostItems ? HOST_TOOLBAR : true)}
        scrollable={scrollable}
        statusBar={statusBar}
        className="lab-document-editor"
        aria-label="Sample document"
        events={{
          onTransaction: (tr) => {
            if (isPaginationTransaction(tr)) document.documentElement.dataset.labReady = 'true';
          },
        }}
      />
    </>
  );
}

const container = document.querySelector('#lab-editor');
if (container) createRoot(container).render(<Lab />);
