// Shows the document editor component (`DocumentEditor`): a sample document in the base template,
// with the editing keys and a table of contents, shown on pages or in the web layout and switched
// between authoring and reading without losing its state, with or without its toolbar and its
// scrolling frame. Right-click anywhere in the document for its context menu, and hover a table
// for the handles that drag its rows and columns.

import { EditorState } from 'prosemirror-state';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DocumentEditor, type DocumentLayout } from '../../src/components/index.js';
import { assignElementIds, createContents, createDocumentEditing } from '../../src/engine/index.js';
import {
  BASE_TEMPLATE,
  BASE_TEMPLATE_ID,
  createDocumentSchema,
  readDocumentFile,
  resolveTemplateFile,
} from '../../src/model/index.js';
import { isPaginationTransaction } from '../../src/pagination/index.js';
import { sampleDocument } from './lab-document.js';

const TEMPLATE = resolveTemplateFile(BASE_TEMPLATE, {
  loadTemplate: (id) => (id === BASE_TEMPLATE_ID ? BASE_TEMPLATE : null),
  baseTemplateId: BASE_TEMPLATE_ID,
});

function initialState(): EditorState {
  const schema = createDocumentSchema();
  const file = sampleDocument(['Scope', 'Interfaces', 'Timing', 'Power']);
  file.sections[0]?.content.unshift({ type: 'contents', attrs: { kind: 'toc', depth: 2 } });
  const state = EditorState.create({
    doc: readDocumentFile(file, schema),
    plugins: [
      createContents({ template: () => TEMPLATE }),
      ...createDocumentEditing(schema, { template: () => TEMPLATE, author: () => 'lab' }),
    ],
  });
  const tr = state.tr;
  assignElementIds(tr, {});
  return state.apply(tr);
}

function Lab() {
  const [state, setState] = useState(initialState);
  const [layout, setLayout] = useState<DocumentLayout>('page');
  const [editable, setEditable] = useState(true);
  const [toolbar, setToolbar] = useState(true);
  const [scrollable, setScrollable] = useState(true);
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
      </fieldset>
      <DocumentEditor
        state={state}
        onStateChange={setState}
        template={TEMPLATE}
        layout={layout}
        editable={editable}
        toolbar={toolbar}
        scrollable={scrollable}
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
