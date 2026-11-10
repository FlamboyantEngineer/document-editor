// The template editor beside the document editor: each change to the template's settings restyles
// the document and lays its pages out again as it is made. The template inherits from the base
// template; its fields show the inherited values until it sets its own.

import { EditorState } from 'prosemirror-state';
import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DocumentEditor, TemplateEditor, TemplateJsonEditor } from '../../src/components/index.js';
import { assignElementIds, createContents, createDocumentEditing } from '../../src/engine/index.js';
import {
  BASE_TEMPLATE,
  BASE_TEMPLATE_ID,
  createDocumentSchema,
  readDocumentFile,
  resolveTemplateFile,
  type TemplateFile,
} from '../../src/model/index.js';
import { isPaginationTransaction } from '../../src/pagination/index.js';
import { sampleDocument } from './lab-document.js';
import { pagesLaidOut } from './lab-ready.js';

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

// The template the plugins read, which the lab keeps up with the editor's.
const current = { template: resolve(OWN) };

function initialState(): EditorState {
  const schema = createDocumentSchema();
  const file = sampleDocument(['Scope', 'Interfaces', 'Timing']);
  file.sections[0]?.content.unshift({ type: 'contents', attrs: { kind: 'toc', depth: 2 } });
  const template = () => current.template;
  const state = EditorState.create({
    doc: readDocumentFile(file, schema),
    plugins: [
      createContents({ template }),
      ...createDocumentEditing(schema, { template, author: () => 'lab' }),
    ],
  });
  const tr = state.tr;
  assignElementIds(tr, {});
  return state.apply(tr.setMeta('addToHistory', false));
}

function Lab() {
  const [state, setState] = useState(initialState);
  const [own, setOwn] = useState<TemplateFile>(OWN);
  const [json, setJson] = useState(false);
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
      <DocumentEditor
        state={state}
        onStateChange={setState}
        template={resolved}
        toolbar
        scrollable
        statusBar
        className="lab-document-editor"
        aria-label="Sample document"
        events={{
          onTransaction: (tr) => {
            if (isPaginationTransaction(tr)) pagesLaidOut();
          },
        }}
      />
    </div>
  );
}

const container = document.querySelector('#lab-editor');
if (container) createRoot(container).render(<Lab />);
