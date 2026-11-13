// The template editor beside the document editor: each change to the template's settings restyles
// the document and lays its pages out again as it is made. The template inherits from the base
// template; its fields show the inherited values until it sets its own. The preview document shows
// every style the template sets, and each of its sections. The pages' headers and footers are the
// template's, edited in place. The settings panel's scope is held here: while the preview shows,
// picking a section scrolls the preview to it. The template's own `extensions.folder` is a host
// setting in an extension slot.

import { EditorState } from 'prosemirror-state';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  DocumentEditor,
  type DocumentEditorHandle,
  type DocumentLayout,
  TemplateEditor,
  TemplateJsonEditor,
  type TemplateScope,
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

// The element id of the first block of the named section, which revealing the section shows.
function sectionElement(state: EditorState, name: TemplateScope): string | null {
  let id: string | null = null;
  state.doc.forEach((section) => {
    if (id !== null || name === null || section.attrs.sectionName !== name) return;
    section.descendants((node) => {
      if (id === null && node.isTextblock && typeof node.attrs.dataId === 'string') {
        id = node.attrs.dataId;
      }
      return id === null;
    });
  });
  return id;
}

function Lab() {
  const [state, setState] = useState(() => initialState());
  const [own, setOwn] = useState<TemplateFile>(OWN);
  const [json, setJson] = useState(false);
  const [scope, setScope] = useState<TemplateScope>(null);
  const [previewing, setPreviewing] = useState(false);
  const handle = useRef<DocumentEditorHandle>(null);
  // The section to show once the preview's pages are drawn.
  const reveal = useRef<TemplateScope>(null);
  useEffect(() => {
    const id = sectionElement(state, reveal.current);
    reveal.current = null;
    if (!id) return;
    // The new preview's pages are laid out over a few renders; the section shows once they settle.
    void handle.current
      ?.whenSettled()
      .then(() => handle.current?.revealElement(id, { behavior: 'instant' }));
  }, [state]);
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
          onClick={() => {
            setPreviewing(true);
            reveal.current = scope;
            setState(initialState(templatePreviewDocument(resolved)));
          }}
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
            scope={scope}
            onScopeChange={(next) => {
              setScope(next);
              const id = previewing ? sectionElement(state, next) : null;
              if (id) handle.current?.revealElement(id, { behavior: 'instant' });
            }}
            parentOptions={[{ id: BASE_TEMPLATE_ID, label: 'Base template' }]}
            extensions={{
              rows: {
                identity: [
                  { id: 'folder', label: 'Folder', path: ['folder'], kind: { type: 'text' } },
                ],
              },
            }}
          />
        )}
      </div>
      {WITH_DOCUMENT ? (
        <DocumentEditor
          state={state}
          onStateChange={setState}
          handleRef={handle}
          template={resolved}
          layout={layout}
          onLayoutChange={setLayout}
          onRegionChange={(change) =>
            setOwn((template) => withRegionChange(template, change, resolve(template)))
          }
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
