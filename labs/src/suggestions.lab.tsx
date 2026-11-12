// Shows suggestions (`suggestTransaction`, which the document editor applies while `suggesting`):
// typed text kept as a suggested insertion, deleted text kept struck, and a split paragraph kept as
// its halves, each attributed to the writer. The list beside the document reads the suggestions
// (`listSuggestions`) and accepts or rejects them one by one or all at once.

import { type Command, EditorState } from 'prosemirror-state';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DocumentEditor } from '../../src/components/index.js';
import {
  acceptAllSuggestions,
  acceptSuggestion,
  assignElementIds,
  createDocumentEditing,
  listSuggestions,
  rejectAllSuggestions,
  rejectSuggestion,
} from '../../src/engine/index.js';
import {
  BASE_TEMPLATE,
  BASE_TEMPLATE_ID,
  createDocumentSchema,
  readDocumentFile,
  resolveTemplateFile,
} from '../../src/model/index.js';
import { heading, text } from './lab-document.js';
import { markReadyWhenSettled } from './lab-ready.js';

const TEMPLATE = resolveTemplateFile(BASE_TEMPLATE, {
  loadTemplate: (id) => (id === BASE_TEMPLATE_ID ? BASE_TEMPLATE : null),
  baseTemplateId: BASE_TEMPLATE_ID,
});

const WRITERS = ['Writer', 'Reviewer'] as const;

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
            line('The system shall report each fault within one second of detecting it.'),
            line('Reports go to the operator console and to the log.'),
            {
              type: 'paragraph',
              content: [
                text('The log keeps '),
                {
                  type: 'text',
                  text: 'every',
                  marks: [{ type: 'deletion', attrs: { id: 'a1b2c3d4', author: 'Reviewer' } }],
                },
                {
                  type: 'text',
                  text: 'each',
                  marks: [{ type: 'insertion', attrs: { id: 'a1b2c3d4', author: 'Reviewer' } }],
                },
                text(' report for ninety days.'),
              ],
            },
          ],
        },
      ],
    },
    schema,
  ).doc;
  const state = EditorState.create({
    doc,
    plugins: createDocumentEditing(schema, { template: () => TEMPLATE, author: () => 'lab' }),
  });
  const tr = state.tr;
  assignElementIds(tr, {});
  // The ids a document opens with are no edit of the writer's to undo.
  return state.apply(tr.setMeta('addToHistory', false));
}

function Lab() {
  const [state, setState] = useState(initialState);
  const [suggesting, setSuggesting] = useState(true);
  const [author, setAuthor] = useState<string>(WRITERS[0]);
  const run = (command: Command) =>
    setState((current) => {
      let next = current;
      command(current, (tr) => {
        next = current.apply(tr);
      });
      return next;
    });
  const suggestions = listSuggestions(state.doc);
  return (
    <div className="lab-layout">
      <div>
        <fieldset>
          <legend>Mode</legend>
          <label>
            <input
              type="checkbox"
              name="suggesting"
              checked={suggesting}
              onChange={(event) => setSuggesting(event.currentTarget.checked)}
            />{' '}
            Suggesting
          </label>
          {WRITERS.map((name) => (
            <label key={name}>
              <input
                type="radio"
                name="author"
                value={name}
                checked={author === name}
                onChange={() => setAuthor(name)}
              />{' '}
              {name}
            </label>
          ))}
        </fieldset>
        <DocumentEditor
          state={state}
          onStateChange={setState}
          template={TEMPLATE}
          suggesting={suggesting}
          author={author}
          aria-label="Sample document"
          events={{
            // Where the editor's caret is, so a test knows the editor took a click.
            onSelectionChange: (selection) => {
              document.documentElement.dataset.labCaret = String(selection.from);
            },
          }}
        />
      </div>
      <aside className="lab-suggestions" aria-label="Suggestions">
        <h2>Suggestions</h2>
        <p>
          <button type="button" onClick={() => run(acceptAllSuggestions)}>
            Accept all
          </button>{' '}
          <button type="button" onClick={() => run(rejectAllSuggestions)}>
            Reject all
          </button>
        </p>
        {suggestions.length ? null : <p>No suggestions.</p>}
        <ul>
          {suggestions.map((suggestion) => (
            <li key={suggestion.id} data-suggestion={suggestion.id}>
              <strong>{suggestion.author ?? 'Someone'}</strong>
              {suggestion.deleted ? <del> {suggestion.deleted}</del> : null}
              {suggestion.inserted ? <ins> {suggestion.inserted}</ins> : null}
              {suggestion.deleted || suggestion.inserted ? null : ' split a paragraph'}
              <div>
                <button type="button" onClick={() => run(acceptSuggestion(suggestion.id))}>
                  Accept
                </button>{' '}
                <button type="button" onClick={() => run(rejectSuggestion(suggestion.id))}>
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

const container = document.querySelector('#lab-editor');
if (container) {
  createRoot(container).render(<Lab />);
  markReadyWhenSettled();
}
