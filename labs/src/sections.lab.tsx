// Shows a document's sections, each in its template section's scope (`createDocumentSections`,
// which the document editor installs): the body on portrait pages with a page break, and an
// appendix on landscape pages with its own header and its chapters lettered. Commands start a
// section after the caret's block (`insertDocumentSection`) and join a section into the one
// before (`joinDocumentSectionBackward`).

import { type Command, EditorState } from 'prosemirror-state';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DocumentEditor } from '../../src/components/index.js';
import {
  assignElementIds,
  createDocumentEditing,
  insertDocumentSection,
  insertPageBreak,
  joinDocumentSectionBackward,
} from '../../src/engine/index.js';
import {
  BASE_TEMPLATE,
  BASE_TEMPLATE_ID,
  createDocumentSchema,
  type DocumentFile,
  readDocumentFile,
  resolveTemplateFile,
  type TemplateFile,
} from '../../src/model/index.js';
import { isPaginationTransaction } from '../../src/pagination/index.js';
import { chapter, text } from './lab-document.js';

const SECTIONED: TemplateFile = {
  formatVersion: 1,
  id: 'sectioned',
  parent: BASE_TEMPLATE_ID,
  sections: [
    {
      name: 'appendix',
      label: 'Appendix',
      insertable: true,
      restartNumbering: true,
      page: { size: 'A4', orientation: 'landscape' },
      styles: {
        heading1: { numbering: { format: 'A.' } },
        heading2: { numbering: { format: 'A.1.' } },
      },
      header: { content: [{ type: 'paragraph', content: [text('Appendix')] }] },
      content: [{ type: 'paragraph', content: [text('Appendix text.')] }],
    },
  ],
};

const TEMPLATE = resolveTemplateFile(SECTIONED, {
  loadTemplate: (id) => (id === BASE_TEMPLATE_ID ? BASE_TEMPLATE : null),
  baseTemplateId: BASE_TEMPLATE_ID,
});

function sample(): DocumentFile {
  return {
    formatVersion: 1,
    sections: [
      {
        name: null,
        content: [...chapter('Scope'), { type: 'pageBreak' }, ...chapter('Interfaces')],
      },
      { name: 'appendix', content: chapter('Glossary') },
    ],
  };
}

function initialState(): EditorState {
  const schema = createDocumentSchema();
  const state = EditorState.create({
    doc: readDocumentFile(sample(), schema),
    plugins: createDocumentEditing(schema, { template: () => TEMPLATE, author: () => 'lab' }),
  });
  const tr = state.tr;
  assignElementIds(tr, {});
  return state.apply(tr);
}

const COMMANDS: readonly (readonly [string, Command])[] = [
  ['Start an appendix after this block', insertDocumentSection(TEMPLATE, 'appendix')],
  ['Start a plain section after this block', insertDocumentSection(TEMPLATE, null)],
  ['Join this section with the one before', joinDocumentSectionBackward(TEMPLATE)],
  ['Insert a page break', insertPageBreak],
];

function Lab() {
  const [state, setState] = useState(initialState);
  const run = (command: Command) =>
    setState((current) => {
      let next = current;
      command(current, (tr) => {
        next = current.apply(tr);
      });
      return next;
    });
  return (
    <>
      <fieldset>
        <legend>Sections</legend>
        {COMMANDS.map(([label, command]) => (
          <button
            key={label}
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => run(command)}
          >
            {label}
          </button>
        ))}
      </fieldset>
      <DocumentEditor
        state={state}
        onStateChange={setState}
        template={TEMPLATE}
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
