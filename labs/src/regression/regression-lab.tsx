// The regression lab's page: a document of the regression set, picked by the Document picker or
// the page's `document` query parameter, in the document editor with its scrolling frame and
// status bar, laid out on its template's pages; with `hostViews`, quotes drawn by a host view. The regression scenarios (`e2e/regression.spec.ts`)
// read the pages it draws and edit them.

import { EditorState } from 'prosemirror-state';
import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  DocumentEditor,
  type DocumentEditorHandle,
  type DocumentLayout,
} from '../../../src/components/index.js';
import {
  assignElementIds,
  createContents,
  createDocumentEditing,
} from '../../../src/engine/index.js';
import {
  createDocumentSchema,
  readDocumentFile,
  type TemplateFile,
} from '../../../src/model/index.js';
import { markReadyWhenSettled } from '../lab-ready.js';
import { useStressProbe } from '../stress/stress-probe.js';
import { HOST_VIEWS } from './host-quote-view.js';
import {
  REGRESSION_DOCUMENTS,
  regressionDocument,
  type RegressionDocumentName,
} from './regression-documents.js';
import { useRegressionProbe } from './regression-probe.js';

const NAMES = Object.keys(REGRESSION_DOCUMENTS) as RegressionDocumentName[];

const isName = (value: string | null): value is RegressionDocumentName =>
  NAMES.some((name) => name === value);

// The document shown on load: the one the query names, or the first.
function initialName(): RegressionDocumentName {
  const asked = new URLSearchParams(window.location.search).get('document');
  return isName(asked) ? asked : (NAMES[0] as RegressionDocumentName);
}

// The layout the query names: pages, or the web layout (`layout=web`).
const LAYOUT: DocumentLayout =
  new URLSearchParams(window.location.search).get('layout') === 'web' ? 'web' : 'page';

// Whether the pages are a projection of the document (`projection`, DOCE-PAGINATION-7.17).
const PROJECTION = new URLSearchParams(window.location.search).has('projection');

// Whether the host draws quotes with a React view of its own (`hostViews`).
const HOST = new URLSearchParams(window.location.search).has('hostViews');

function opened(name: RegressionDocumentName): { state: EditorState; template: TemplateFile } {
  const { file, template } = regressionDocument(name);
  const schema = createDocumentSchema();
  const state = EditorState.create({
    doc: readDocumentFile(file, schema).doc,
    plugins: [
      createContents({ template: () => template }),
      ...createDocumentEditing(schema, { template: () => template, author: () => 'lab' }),
    ],
  });
  const tr = state.tr;
  assignElementIds(tr, {});
  // The ids a document opens with are no edit of the writer's to undo.
  return { state: state.apply(tr.setMeta('addToHistory', false)), template };
}

function RegressionLab() {
  const [name, setName] = useState(initialName);
  const [first] = useState(() => opened(name));
  const [template, setTemplate] = useState(first.template);
  const [state, setState] = useState(first.state);
  const handle = useRef<DocumentEditorHandle>(null);
  useStressProbe(handle, null);
  useRegressionProbe(handle);
  const pick = (next: string) => {
    if (!isName(next)) return;
    setName(next);
    const picked = opened(next);
    setTemplate(picked.template);
    setState(picked.state);
    const url = new URL(window.location.href);
    url.searchParams.set('document', next);
    window.history.replaceState(null, '', url);
  };
  return (
    <>
      <fieldset>
        <legend>View</legend>
        <label>
          Document{' '}
          <select
            name="document"
            value={name}
            onChange={(event) => pick(event.currentTarget.value)}
          >
            {NAMES.map((each) => (
              <option key={each} value={each}>
                {each}
              </option>
            ))}
          </select>
        </label>
      </fieldset>
      <DocumentEditor
        key={name}
        state={state}
        onStateChange={setState}
        template={template}
        layout={LAYOUT}
        projection={PROJECTION}
        nodeViews={HOST ? HOST_VIEWS : undefined}
        scrollable
        statusBar
        className="lab-document-editor"
        aria-label="Regression document"
        handleRef={handle}
      />
    </>
  );
}

/** Mounts the regression lab in `#lab-editor`. */
export function mountRegressionLab(): void {
  const container = document.querySelector('#lab-editor');
  if (!container) return;
  createRoot(container).render(<RegressionLab />);
  markReadyWhenSettled();
}
