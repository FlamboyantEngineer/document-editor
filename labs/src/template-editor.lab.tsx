// The template editor beside the document editor: each change to the template's settings restyles
// the document and lays its pages out again as it is made. The template inherits from the base
// template; its fields show the inherited values until it sets its own. The preview document shows
// every style the template sets, and each of its sections. The pages' headers and footers are the
// template's, edited in place.

import { EditorState } from 'prosemirror-state';
import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  DocumentEditor,
  type DocumentLayout,
  TemplateEditor,
  TemplateJsonEditor,
  withRegionChange,
} from '../../src/components/index.js';
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
  type DocumentFile,
  readDocumentFile,
  resolveTemplateFile,
  type TemplateFile,
  templatePreviewDocument,
} from '../../src/model/index.js';
import { sampleDocument } from './lab-document.js';
import { markReadyWhenSettled } from './lab-ready.js';

const OWN: TemplateFile = {
  formatVersion: 1,
  id: 'lab-template',
  name: 'Lab template',
  parent: BASE_TEMPLATE_ID,
};

const resolve = (template: TemplateFile) =>
  resolveTemplateFile(template, {
    loadTemplate: (id) => (id === BASE_TEMPLATE_ID ? BASE_TEMPLATE : null),
    baseTemplateId: BASE_TEMPLATE_ID,
  });

// The document is proofed, so the status bar has its proofing menu.
const PROOFER = createWordListProofer({
  corrections: { teh: ['the'] },
  languages: [{ id: 'en-US', label: 'English (United States)' }],
});

// The template the plugins read, which the lab keeps up with the editor's.
const current = { template: resolve(OWN) };

function initialState(file?: DocumentFile): EditorState {
  const schema = createDocumentSchema();
  if (!file) {
    file = sampleDocument(['Scope', 'Interfaces', 'Timing']);
    file.sections[0]?.content.unshift({ type: 'contents', attrs: { kind: 'toc', depth: 2 } });
  }
  const template = () => current.template;
  const state = EditorState.create({
    doc: readDocumentFile(file, schema).doc,
    plugins: [
      createContents({ template }),
      createProofing({ proofer: PROOFER, delay: 200, language: 'en-US' }),
      ...createDocumentEditing(schema, { template, author: () => 'lab' }),
    ],
  });
  const tr = state.tr;
  assignElementIds(tr, {});
  return state.apply(tr.setMeta('addToHistory', false));
}

// `?document=none` shows the settings alone, for tests that set hundreds of them.
const WITH_DOCUMENT = new URLSearchParams(window.location.search).get('document') !== 'none';

function Lab() {
  const [state, setState] = useState(() => initialState());
  const [own, setOwn] = useState<TemplateFile>(OWN);
  const [json, setJson] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [layout, setLayout] = useState<DocumentLayout>('page');
  const resolved = useMemo(() => resolve(own), [own]);
  useEffect(() => {
    current.template = resolved;
  }, [resolved]);
  return (
    <div className="lab-split">
      <div className="lab-template-panel">
        <label>
          <input
            type="checkbox"
            name="json"
            checked={json}
            onChange={(event) => setJson(event.currentTarget.checked)}
          />{' '}
          Edit as JSON
        </label>
        <button
          type="button"
          onClick={() => setState(initialState(templatePreviewDocument(resolved)))}
        >
          Preview the template
        </button>
        {json ? (
          <TemplateJsonEditor template={own} onChange={setOwn} />
        ) : (
          <TemplateEditor
            template={own}
            resolved={resolved}
            onChange={setOwn}
            parentOptions={[{ id: BASE_TEMPLATE_ID, label: 'Base template' }]}
          />
        )}
      </div>
      {WITH_DOCUMENT ? (
        <DocumentEditor
          state={state}
          onStateChange={setState}
          template={resolved}
          layout={layout}
          onLayoutChange={setLayout}
          onRegionChange={(change) => setOwn((template) => withRegionChange(template, change))}
          zoom={zoom}
          onZoomChange={setZoom}
          toolbar
          scrollable
          statusBar
          className="lab-document-editor"
          aria-label="Sample document"
        />
      ) : null}
    </div>
  );
}

const container = document.querySelector('#lab-editor');
if (container) {
  createRoot(container).render(<Lab />);
  if (WITH_DOCUMENT) markReadyWhenSettled();
  else document.documentElement.dataset.labReady = 'true';
}
