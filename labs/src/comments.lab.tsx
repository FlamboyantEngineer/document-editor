// Shows the comments margin (the document editor's `comments`): threads kept by the in-memory
// host's comment store, anchored to the text they quote, and suggestions with Accept, Reject and a
// thread of their own. Reading, the margin shows the threads without composers or decisions.

import { EditorState } from 'prosemirror-state';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DocumentEditor } from '../../src/components/index.js';
import { assignElementIds, createDocumentEditing } from '../../src/engine/index.js';
import { createMemoryHost } from '../../src/host/index.js';
import {
  BASE_TEMPLATE,
  BASE_TEMPLATE_ID,
  createDocumentSchema,
  readDocumentFile,
  resolveTemplateFile,
} from '../../src/model/index.js';
import { isPaginationTransaction } from '../../src/pagination/index.js';
import { heading, text } from './lab-document.js';
import { pagesLaidOut } from './lab-ready.js';

const TEMPLATE = resolveTemplateFile(BASE_TEMPLATE, {
  loadTemplate: (id) => (id === BASE_TEMPLATE_ID ? BASE_TEMPLATE : null),
  baseTemplateId: BASE_TEMPLATE_ID,
});

const HOST = createMemoryHost({
  person: { id: 'ada', name: 'Ada Lovelace' },
  people: [{ id: 'grace', name: 'Grace Hopper' }],
  comments: {
    threads: {
      lab: [
        {
          id: 'c0ffee01',
          state: 'open',
          quote: 'one second',
          suggestion: null,
          entries: [
            {
              id: 'e1',
              author: 'grace',
              text: 'Is one second measured from the fault or from its detection?',
              createdAt: '2026-01-05T09:30:00Z',
            },
          ],
        },
      ],
    },
  },
});

function initialState(): EditorState {
  const schema = createDocumentSchema();
  const line = (value: string) => ({ type: 'paragraph', content: [text(value)] });
  const doc = readDocumentFile(
    {
      formatVersion: 1,
      sections: [
        {
          name: null,
          content: [
            heading(1, 'Scope'),
            {
              type: 'paragraph',
              content: [
                text('The system shall report each fault within '),
                {
                  type: 'text',
                  text: 'one second',
                  marks: [{ type: 'comment', attrs: { thread: 'c0ffee01', state: 'open' } }],
                },
                text(' of detecting it.'),
              ],
            },
            line('Reports go to the operator console and to the log.'),
            {
              type: 'paragraph',
              content: [
                text('The log keeps '),
                {
                  type: 'text',
                  text: 'every',
                  marks: [{ type: 'deletion', attrs: { id: 'a1b2c3d4', author: 'grace' } }],
                },
                {
                  type: 'text',
                  text: 'each',
                  marks: [{ type: 'insertion', attrs: { id: 'a1b2c3d4', author: 'grace' } }],
                },
                text(' report for ninety days.'),
              ],
            },
          ],
        },
      ],
    },
    schema,
  );
  const state = EditorState.create({
    doc,
    plugins: createDocumentEditing(schema, { template: () => TEMPLATE, author: () => 'ada' }),
  });
  const tr = state.tr;
  assignElementIds(tr, {});
  // The ids a document opens with are no edit of the writer's to undo.
  return state.apply(tr.setMeta('addToHistory', false));
}

function Lab() {
  const [state, setState] = useState(initialState);
  const [reading, setReading] = useState(false);
  const comments = HOST.comments;
  return (
    <div>
      <fieldset>
        <legend>Mode</legend>
        <label>
          <input
            type="checkbox"
            name="reading"
            checked={reading}
            onChange={(event) => setReading(event.currentTarget.checked)}
          />{' '}
          Reading only
        </label>
      </fieldset>
      <DocumentEditor
        state={state}
        onStateChange={setState}
        template={TEMPLATE}
        editable={!reading}
        aria-label="Sample document"
        comments={
          comments && {
            store: comments,
            documentId: 'lab',
            identity: HOST.identity,
            canComment: !reading,
          }
        }
        events={{
          onTransaction: (tr) => {
            if (isPaginationTransaction(tr)) pagesLaidOut();
          },
          // Where the editor's caret is, so a test knows the editor took a click.
          onSelectionChange: (selection) => {
            document.documentElement.dataset.labCaret = `${String(selection.from)}-${String(selection.to)}`;
          },
        }}
      />
    </div>
  );
}

const container = document.querySelector('#lab-editor');
if (container) createRoot(container).render(<Lab />);
