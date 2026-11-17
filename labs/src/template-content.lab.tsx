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
import { createMemoryHost, type VariablesAdapter } from '../../src/host/index.js';
import {
  BASE_TEMPLATE,
  BASE_TEMPLATE_ID,
  createDocumentSchema,
  readDocumentFile,
  resolveTemplateFile,
  type TemplateFile,
  templatePreviewDocument,
  withEditableSections,
  withTemplatePart,
} from '../../src/model/index.js';
import { markReadyWhenSettled } from './lab-ready.js';
import { runLabScript } from './lab-scripts.js';

// Runs the template's scripts for their previews.
const SCRIPTS = createMemoryHost({ scripts: runLabScript }).scripts;

const text = (value: string) => ({ type: 'text', text: value });

// A table of one row of two cells 120 pixels wide, captioned, aligned as given.
const benchTable = (caption: string, cells: string[], layout?: string) => ({
  type: 'table',
  attrs: { caption, captionEnabled: true, ...(layout ? { layout } : {}) },
  content: [
    {
      type: 'tableRow',
      content: cells.map((value) => ({
        type: 'tableCell',
        attrs: { colwidth: [120] },
        content: [{ type: 'paragraph', content: [text(value)] }],
      })),
    },
  ],
});

const OWN: TemplateFile = {
  formatVersion: 1,
  id: 'lab-template',
  name: 'Lab template',
  parent: BASE_TEMPLATE_ID,
  header: { content: [{ type: 'paragraph', content: [text('Lab template')] }] },
  // A borderless table in the footer, which shows a dashed guide while the template is edited.
  footer: {
    content: [
      {
        type: 'table',
        attrs: { border: 'table-border-none', captionEnabled: false },
        content: [
          {
            type: 'tableRow',
            content: ['Document number', 'Issued'].map((value) => ({
              type: 'tableCell',
              content: [{ type: 'paragraph', content: [text(value)] }],
            })),
          },
        ],
      },
    ],
  },
  // Caption and footnote typography: the document's, which the appendix section overrides in part.
  styles: {
    table: { caption: { label: { weight: 700 }, text: { italic: true } } },
    codeBlock: { caption: { label: { weight: 700 } } },
  },
  footnotes: { suffix: ')', text: { size: '11px' } },
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
      editable: false,
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [text('Approvals')] },
        { type: 'paragraph', content: [text('Approved by the reviewers.')] },
        // A script the template keeps without output, which its preview runs to show.
        { type: 'script', attrs: { source: 'render.paragraph("Signed by the approvers.")' } },
      ],
    },
    {
      name: 'appendix',
      label: 'Appendix',
      editable: false,
      styles: {
        table: { caption: { alignment: 'center', text: { italic: false, weight: 300 } } },
      },
      footnotes: { text: { size: '13px' } },
      content: [
        {
          type: 'paragraph',
          content: [
            text('Measured on the bench.'),
            { type: 'footnote', attrs: { id: 'appendix-note' }, content: [text('At rest.')] },
          ],
        },
        // Narrower than the page: one as laid out, one aligned right, each caption centred on it.
        benchTable('Bench limits', ['Load', 'Limit']),
        benchTable('Bench steps', ['Step', 'Time'], 'right'),
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
      template: () => withEditableSections(current.template),
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
  const editable = useMemo(() => withEditableSections(resolved), [resolved]);
  useEffect(() => {
    current.template = resolved;
  }, [resolved]);
  return (
    <div className="lab-split">
      {/* The panel scrolls, so a keyboard reaches it. */}
      <div className="lab-template-panel" role="region" aria-label="Template" tabIndex={0}>
        <pre aria-label="Template JSON">{JSON.stringify(own, null, 2)}</pre>
      </div>
      <DocumentEditor
        state={state}
        onStateChange={setState}
        template={editable}
        variables={VARIABLES}
        scriptRunner={SCRIPTS}
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
