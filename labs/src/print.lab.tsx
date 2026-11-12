// Shows a snapshot for printing (`exportSnapshot`): a document whose body sits on portrait pages
// and whose appendix sits on landscape pages, proofed by a word-list proofer, with the layout
// debugging and a comparison with the document as it opened on demand. The print preview shows
// the snapshot in a frame, each section on its own sheet size, without the view-only decorations
// (search matches, proofing issues, debugging), with a comparison's deleted text and change bars,
// and its suggestions in the markup picked.

import { EditorState } from 'prosemirror-state';
import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DocumentEditor, type DocumentEditorHandle } from '../../src/components/index.js';
import { assignElementIds, createDocumentEditing, createProofing } from '../../src/engine/index.js';
import { createWordListProofer } from '../../src/host/index.js';
import {
  BASE_TEMPLATE,
  BASE_TEMPLATE_ID,
  createDocumentSchema,
  type DocumentFile,
  readDocumentFile,
  resolveTemplateFile,
  type TemplateFile,
} from '../../src/model/index.js';
import { chapter, text } from './lab-document.js';
import { markReadyWhenSettled } from './lab-ready.js';

const SECTIONED: TemplateFile = {
  formatVersion: 1,
  id: 'print',
  parent: BASE_TEMPLATE_ID,
  sections: [
    {
      name: 'appendix',
      label: 'Appendix',
      page: { size: 'A4', orientation: 'landscape' },
      header: { content: [{ type: 'paragraph', content: [text('Appendix')] }] },
    },
  ],
};

const TEMPLATE = resolveTemplateFile(SECTIONED, {
  loadTemplate: (id) => (id === BASE_TEMPLATE_ID ? BASE_TEMPLATE : null),
  baseTemplateId: BASE_TEMPLATE_ID,
});

const PROOFER = createWordListProofer({ corrections: { teh: ['the'] } });

function sample(): DocumentFile {
  return {
    formatVersion: 1,
    sections: [
      {
        name: null,
        content: [
          ...chapter('Scope'),
          { type: 'paragraph', content: [text('Check teh limits before each release.')] },
        ],
      },
      { name: 'appendix', content: chapter('Glossary') },
    ],
  };
}

function initialState(): EditorState {
  const schema = createDocumentSchema();
  const state = EditorState.create({
    doc: readDocumentFile(sample(), schema).doc,
    plugins: [
      createProofing({ proofer: PROOFER }),
      ...createDocumentEditing(schema, { template: () => TEMPLATE, author: () => 'lab' }),
    ],
  });
  const tr = state.tr;
  assignElementIds(tr, {});
  // The ids a document opens with are no edit of the writer's to undo.
  return state.apply(tr.setMeta('addToHistory', false));
}

// The pages are a projection of the state (DOCE-PAGINATION-7.17) unless `?paginate` asks for the
// state paginated itself.
const PROJECTION = !new URLSearchParams(window.location.search).has('paginate');

// The lab's own stylesheet, so the preview is styled as the editor is.
const stylesheet = () => new URL('build/reference.css', window.location.href).href;

// How the print preview shows suggestions: as the editor shows them, or as one of the markups.
const MARKUPS = [
  ['editor', 'As the editor shows them'],
  ['all', 'All markup'],
  ['final', 'As if accepted'],
  ['original', 'As if rejected'],
] as const;

type PreviewMarkup = (typeof MARKUPS)[number][0];

function Lab() {
  const [state, setState] = useState(initialState);
  // The document as it opened, the version a comparison shows the changes from.
  const [opened] = useState(() => state.doc);
  const [debug, setDebug] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [markup, setMarkup] = useState<PreviewMarkup>('editor');
  const [snapshot, setSnapshot] = useState('');
  const handle = useRef<DocumentEditorHandle>(null);
  const preview = () =>
    setSnapshot(
      handle.current?.exportSnapshot({
        title: 'Print sample',
        stylesheets: [stylesheet()],
        markup: markup === 'editor' ? undefined : markup,
      }) ?? '',
    );
  return (
    <>
      <fieldset>
        <legend>Print</legend>
        <label>
          <input
            type="checkbox"
            checked={debug}
            onChange={(event) => setDebug(event.currentTarget.checked)}
          />
          Show the layout debugging
        </label>
        <label>
          <input
            type="checkbox"
            checked={comparing}
            onChange={(event) => setComparing(event.currentTarget.checked)}
          />
          Compare with the document as it opened
        </label>
        <label>
          Suggestions in print{' '}
          <select
            value={markup}
            onChange={(event) => setMarkup(event.currentTarget.value as PreviewMarkup)}
          >
            {MARKUPS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={preview}>
          Make a print preview
        </button>
      </fieldset>
      <DocumentEditor
        state={state}
        onStateChange={setState}
        template={TEMPLATE}
        projection={PROJECTION}
        toolbar
        find
        debug={debug}
        compare={comparing ? { previous: opened } : null}
        handleRef={handle}
        aria-label="Sample document"
      />
      {snapshot ? <iframe title="Print preview" srcDoc={snapshot} /> : null}
    </>
  );
}

const container = document.querySelector('#lab-editor');
if (container) {
  createRoot(container).render(<Lab />);
  markReadyWhenSettled();
}
