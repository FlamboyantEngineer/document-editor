// A template's content edited in place on its preview, shown in parts: a read-only sample of its
// styles, then each template section's starting content and its placeholder. Each edit, and each
// edit of a header or footer, is written into the template, shown beside the pages as JSON.

import { EditorState } from 'prosemirror-state';
import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DocumentEditor, withRegionChange } from '../../src/components/index.js';
import {
  assignElementIds,
  createDocumentEditing,
  templatePreviewLock,
} from '../../src/engine/index.js';
import type { VariablesAdapter } from '../../src/host/index.js';
import {
  BASE_TEMPLATE,
  BASE_TEMPLATE_ID,
  createDocumentSchema,
  readDocumentFile,
  resolveTemplateFile,
  type TemplateFile,
  templatePreviewDocument,
  withTemplatePart,
} from '../../src/model/index.js';
import { markReadyWhenSettled } from './lab-ready.js';

const text = (value: string) => ({ type: 'text', text: value });

const OWN: TemplateFile = {
  formatVersion: 1,
  id: 'lab-template',
  name: 'Lab template',
  parent: BASE_TEMPLATE_ID,
  header: { content: [{ type: 'paragraph', content: [text('Lab template')] }] },
  sections: [
    {
      name: 'summary',
      label: 'Summary',
      insertable: true,
      placeholder: [{ type: 'paragraph', content: [text('Summarise the document.')] }],
    },
    {
      name: 'approvals',
      label: 'Approvals',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [text('Approvals')] },
        { type: 'paragraph', content: [text('Approved by the reviewers.')] },
      ],
    },
  ],
};

const resolve = (template: TemplateFile) =>
  resolveTemplateFile(template, {
    loadTemplate: (id) => (id === BASE_TEMPLATE_ID ? BASE_TEMPLATE : null),
    baseTemplateId: BASE_TEMPLATE_ID,
  });

// The host's variables, which the variable menu lists after the editor's own.
const VARIABLES: VariablesAdapter = {
  value: (key) => (key === 'document.name' ? 'Interface notes' : null),
  catalog: () => [{ key: 'document.name', label: 'Document name' }],
};

// The template the plugins read, which the lab keeps up with the editor's.
const current = { template: resolve(OWN) };

function initialState(): EditorState {
  const schema = createDocumentSchema();
  const file = templatePreviewDocument(current.template, undefined, { parts: true });
  const state = EditorState.create({
    doc: readDocumentFile(file, schema).doc,
    plugins: createDocumentEditing(schema, {
      template: () => current.template,
      author: () => 'lab',
      isLocked: templatePreviewLock,
    }),
  });
  const tr = state.tr;
  assignElementIds(tr, {});
  return state.apply(tr.setMeta('addToHistory', false));
}

function Lab() {
  const [state, setState] = useState(initialState);
  const [own, setOwn] = useState<TemplateFile>(OWN);
  const resolved = useMemo(() => resolve(own), [own]);
  useEffect(() => {
    current.template = resolved;
  }, [resolved]);
  return (
    <div className="lab-split">
      <div className="lab-template-panel">
        <pre aria-label="Template JSON">{JSON.stringify(own, null, 2)}</pre>
      </div>
      <DocumentEditor
        state={state}
        onStateChange={setState}
        template={resolved}
        variables={VARIABLES}
        onRegionChange={(change) => setOwn((template) => withRegionChange(template, change))}
        onTemplatePartChange={(change) =>
          setOwn((template) => withTemplatePart(template, change, resolve(template)))
        }
        toolbar
        scrollable
        className="lab-document-editor"
        aria-label="Template preview"
      />
    </div>
  );
}

const container = document.querySelector('#lab-editor');
if (container) {
  createRoot(container).render(<Lab />);
  markReadyWhenSettled();
}
