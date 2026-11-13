// The side panels as a host drives them: the panel at the document's start controlled by the host
// (its selected pane, whether it shows and its width between a narrowest and widest), or left to
// itself and remembered across reloads under a key through the page's storage; and the panes
// used on their own beside the document: the outline, leaving out the title heading or collapsing
// the headings below a level, the search pane, the properties and the contributors.

import { createSafeStorage, UiProvider } from '@flamboyantengineer/ui-components/core';
import { EditorState } from 'prosemirror-state';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  DocumentContributors,
  DocumentEditor,
  DocumentOutline,
  DocumentProperties,
  DocumentSearchPane,
  DocumentSidePanel,
} from '../../src/components/index.js';
import { assignElementIds, createDocumentEditing } from '../../src/engine/index.js';
import { BASE_TEMPLATE, createDocumentSchema, readDocumentFile } from '../../src/model/index.js';
import { heading, sampleDocument } from './lab-document.js';
import { markReadyWhenSettled } from './lab-ready.js';

// The page's storage, which keeps the remembered panel across reloads.
const STORAGE = createSafeStorage({
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: (key) => window.localStorage.removeItem(key),
});

// The document's title, a heading the outline may leave out.
const TITLE = 'Sample document';

const PANES = ['outline', 'search', 'properties', 'contributors'] as const;

function initialState(): EditorState {
  const schema = createDocumentSchema();
  const file = sampleDocument(['Scope', 'Interfaces', 'Timing']);
  file.sections[0]?.content.unshift(heading(1, TITLE));
  const state = EditorState.create({
    doc: readDocumentFile(file, schema).doc,
    plugins: createDocumentEditing(schema, { template: () => BASE_TEMPLATE, author: () => 'lab' }),
  });
  const tr = state.tr;
  assignElementIds(tr, {});
  return state.apply(tr.setMeta('addToHistory', false));
}

function Lab() {
  const [state, setState] = useState(initialState);
  const [controlled, setControlled] = useState(true);
  const [selected, setSelected] = useState<string>('outline');
  const [expanded, setExpanded] = useState(true);
  const [size, setSize] = useState(280);
  const [reported, setReported] = useState('');
  const [withoutTitle, setWithoutTitle] = useState(false);
  const [collapseBelow, setCollapseBelow] = useState(0);
  const report = (what: string) => setReported(what);
  const panel = controlled ? (
    <DocumentSidePanel
      position="start"
      panes={PANES}
      template={BASE_TEMPLATE}
      selectedPane={selected}
      onSelectedPaneChange={(pane) => {
        setSelected(pane);
        report(`Selected ${pane}`);
      }}
      isExpanded={expanded}
      onExpandedChange={(shown) => {
        setExpanded(shown);
        report(shown ? 'Expanded' : 'Collapsed');
      }}
      size={size}
      onSizeChange={(width) => {
        setSize(width);
        report(`Resized to ${String(width)}`);
      }}
      minSize={220}
      maxSize={420}
    />
  ) : (
    <DocumentSidePanel
      position="start"
      panes={PANES}
      template={BASE_TEMPLATE}
      defaultSelectedPane="search"
      defaultExpanded
      defaultSize={320}
      persistKey="lab-panels"
      onSelectedPaneChange={(pane) => report(`Selected ${pane}`)}
      onExpandedChange={(shown) => report(shown ? 'Expanded' : 'Collapsed')}
      onSizeChange={(width) => report(`Resized to ${String(width)}`)}
    />
  );
  return (
    <UiProvider storage={STORAGE}>
      <div className="lab-controls">
        <fieldset>
          <legend>Panel at the start</legend>
          <label>
            <input
              type="checkbox"
              checked={controlled}
              onChange={(event) => setControlled(event.currentTarget.checked)}
            />{' '}
            Controlled by the host
          </label>{' '}
          <label>
            Selected pane{' '}
            <select
              value={selected}
              disabled={!controlled}
              onChange={(event) => setSelected(event.currentTarget.value)}
            >
              {PANES.map((pane) => (
                <option key={pane} value={pane}>
                  {pane}
                </option>
              ))}
            </select>
          </label>{' '}
          <label>
            <input
              type="checkbox"
              checked={expanded}
              disabled={!controlled}
              onChange={(event) => setExpanded(event.currentTarget.checked)}
            />{' '}
            Panel expanded
          </label>{' '}
          <label>
            Width{' '}
            <input
              type="range"
              min={220}
              max={420}
              value={size}
              disabled={!controlled}
              onChange={(event) => setSize(Number(event.currentTarget.value))}
            />
          </label>
          <output aria-label="Panel report">{reported}</output>
        </fieldset>
        <fieldset>
          <legend>Outline beside the document</legend>
          <label>
            <input
              type="checkbox"
              checked={withoutTitle}
              onChange={(event) => setWithoutTitle(event.currentTarget.checked)}
            />{' '}
            Leave out the title
          </label>{' '}
          <label>
            Collapse below level{' '}
            <select
              value={collapseBelow}
              onChange={(event) => setCollapseBelow(Number(event.currentTarget.value))}
            >
              <option value={0}>None</option>
              <option value={1}>1</option>
              <option value={2}>2</option>
            </select>
          </label>
        </fieldset>
      </div>
      <DocumentEditor
        state={state}
        onStateChange={setState}
        template={BASE_TEMPLATE}
        author="lab"
        find
        panels={{ start: panel }}
        aria-label="Sample document"
      >
        <aside className="lab-panels" aria-label="Panes on their own">
          <DocumentOutline
            key={`${String(withoutTitle)}-${String(collapseBelow)}`}
            template={BASE_TEMPLATE}
            include={withoutTitle ? (entry) => entry.text !== TITLE : undefined}
            collapseBelowLevel={collapseBelow || undefined}
          />
          <DocumentSearchPane />
          <DocumentProperties />
          <DocumentContributors />
        </aside>
      </DocumentEditor>
    </UiProvider>
  );
}

const container = document.querySelector('#lab-editor');
if (container) {
  createRoot(container).render(<Lab />);
  markReadyWhenSettled();
}
