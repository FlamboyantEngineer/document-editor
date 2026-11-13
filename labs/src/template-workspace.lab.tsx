// The template workspace over the in-memory host's template store: pick a template, edit it, save
// it, save it as a copy, delete it, and browse and restore its versions, with the template's
// preview document beside the settings. The Article template is for the web layout, which the lab
// keeps in the template's own `extensions.layout`, so it previews as the web layout shows a
// document. "Save elsewhere" saves the open template as another writer would, so the next save
// meets a conflict.

import { EditorState } from 'prosemirror-state';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  DocumentEditor,
  type TemplatePreview,
  TemplateWorkspace,
} from '../../src/components/index.js';
import { assignElementIds, createContents, createDocumentEditing } from '../../src/engine/index.js';
import { createMemoryHost } from '../../src/host/index.js';
import {
  createDocumentSchema,
  readDocumentFile,
  type TemplateFile,
  templatePreviewDocument,
} from '../../src/model/index.js';
import { markReadyWhenSettled } from './lab-ready.js';

const TEMPLATES: TemplateFile[] = [
  { formatVersion: 1, id: 'report', name: 'Report' },
  {
    formatVersion: 1,
    id: 'report',
    name: 'Report',
    styles: { heading1: { color: '#1d4ed8' } },
  },
  {
    formatVersion: 1,
    id: 'letter',
    name: 'Letter',
    parent: 'report',
    page: { size: 'US Letter' },
  },
  {
    formatVersion: 1,
    id: 'article',
    name: 'Article',
    page: { margins: { top: '24px', right: '24px', bottom: '24px', left: '24px' } },
    styles: { paragraph: { font: 'Arial', size: '15px', lineHeight: 1.6 } },
    extensions: { layout: 'web' },
  },
];

const host = createMemoryHost({ templates: TEMPLATES });
const { templates: store } = host;

// The template the preview's plugins read, which the lab keeps up with the preview's.
const current: { template: TemplateFile | null } = { template: null };

// The preview's document is the template's preview document, made again for another template.
function previewState(template: TemplateFile) {
  const schema = createDocumentSchema();
  const read = () => current.template ?? template;
  const state = EditorState.create({
    doc: readDocumentFile(templatePreviewDocument(template), schema).doc,
    plugins: [
      createContents({ template: read }),
      ...createDocumentEditing(schema, { template: read, author: () => 'lab' }),
    ],
  });
  const tr = state.tr;
  assignElementIds(tr, {});
  return state.apply(tr.setMeta('addToHistory', false));
}

function Preview({ preview }: { preview: TemplatePreview }) {
  const [state, setState] = useState(() => previewState(preview.template));
  useEffect(() => {
    current.template = preview.template;
  }, [preview.template]);
  return (
    <DocumentEditor
      state={state}
      onStateChange={setState}
      template={preview.template}
      layout={preview.layout}
      onRegionChange={preview.onRegionChange}
      editable={preview.onRegionChange !== undefined}
      scrollable
      className="lab-document-editor"
      aria-label="Template preview document"
    />
  );
}

function Lab() {
  const [openId, setOpenId] = useState<string | null>('report');
  const saveElsewhere = async () => {
    if (!openId) return;
    const loaded = await store.load(openId);
    if (!loaded.ok) return;
    const { template, revision } = loaded.value;
    await store.save(openId, {
      template: { ...template, name: `${template.name ?? openId} (saved elsewhere)` },
      baseRevision: revision,
    });
  };
  return (
    <>
      <p>
        <button type="button" onClick={() => void saveElsewhere()}>
          Save elsewhere
        </button>
      </p>
      <TemplateWorkspace
        store={store}
        defaultTemplateId="report"
        onTemplateIdChange={setOpenId}
        layoutOf={(template) => (template.extensions?.layout === 'web' ? 'web' : 'page')}
        renderPreview={(preview) => (
          <Preview key={`${preview.template.id}:${preview.layout}`} preview={preview} />
        )}
        extensions={{
          rows: {
            identity: [{ id: 'layout', label: 'Layout', path: ['layout'], kind: { type: 'text' } }],
          },
        }}
        className="lab-template-workspace"
      />
    </>
  );
}

const container = document.querySelector('#lab-editor');
if (container) {
  createRoot(container).render(<Lab />);
  markReadyWhenSettled();
}
