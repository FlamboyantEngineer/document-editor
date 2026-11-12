// Shows the comments margin (the document editor's `comments`): threads kept by the in-memory
// host's comment store, anchored to the text they quote, and suggestions with Accept, Reject and a
// thread of their own. Reading, the margin shows the threads without composers or decisions. The
// reader edits and deletes their own comments, reacts to any, shows resolved threads to reopen
// them, and opens a thread through the editor's handle. The margin filters to the reader's own
// threads, reads comments as Markdown, keeps to an audience and shows mentions without cards. The
// threads may live in the comments panel alone, and the handle opens a thread at a comment with a
// reply started, or starts a thread with its text.

import { EditorState } from 'prosemirror-state';
import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  type CommentsAudience,
  DocumentCommentsPanel,
  DocumentEditor,
  type DocumentEditorHandle,
} from '../../src/components/index.js';
import { assignElementIds, createDocumentEditing } from '../../src/engine/index.js';
import { createMemoryHost } from '../../src/host/index.js';
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
              reactions: { '👍': ['grace'] },
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
                  marks: [
                    {
                      type: 'comment',
                      attrs: { id: '5eed0001', thread: 'c0ffee01', state: 'open' },
                    },
                  ],
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
  ).doc;
  const state = EditorState.create({
    doc,
    plugins: createDocumentEditing(schema, { template: () => TEMPLATE, author: () => 'ada' }),
  });
  const tr = state.tr;
  assignElementIds(tr, {});
  // The ids a document opens with are no edit of the writer's to undo.
  return state.apply(tr.setMeta('addToHistory', false));
}

// Whether the reader wrote in a thread, as an audience that hides the threads they did not.
const onlyMine: CommentsAudience = (thread, me) =>
  thread.entries.some((entry) => entry.author === me);

function Lab() {
  const [state, setState] = useState(initialState);
  const [reading, setReading] = useState(false);
  const [resolved, setResolved] = useState(false);
  const [panel, setPanel] = useState(false);
  const [pane, setPane] = useState(false);
  const [mine, setMine] = useState(false);
  const [markdown, setMarkdown] = useState(false);
  const [audience, setAudience] = useState(false);
  const [plainChips, setPlainChips] = useState(false);
  const handle = useRef<DocumentEditorHandle>(null);
  const comments = HOST.comments;
  const review = {
    format: markdown ? ('markdown-inline' as const) : ('plain' as const),
    audience: audience ? onlyMine : undefined,
    mentionCard: plainChips ? null : undefined,
    placement: pane ? ('pane' as const) : ('margin' as const),
  };
  const filter = mine ? 'mine' : resolved ? 'all' : 'open';
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
        <label>
          <input
            type="checkbox"
            name="resolved"
            checked={resolved}
            onChange={(event) => setResolved(event.currentTarget.checked)}
          />{' '}
          Resolved threads
        </label>
        <label>
          <input
            type="checkbox"
            name="panel"
            checked={panel}
            onChange={(event) => setPanel(event.currentTarget.checked)}
          />{' '}
          Comments panel
        </label>
        <label>
          <input
            type="checkbox"
            name="mine"
            checked={mine}
            onChange={(event) => setMine(event.currentTarget.checked)}
          />{' '}
          Mine only
        </label>
        <label>
          <input
            type="checkbox"
            name="markdown"
            checked={markdown}
            onChange={(event) => setMarkdown(event.currentTarget.checked)}
          />{' '}
          Markdown comments
        </label>
        <label>
          <input
            type="checkbox"
            name="audience"
            checked={audience}
            onChange={(event) => setAudience(event.currentTarget.checked)}
          />{' '}
          Threads I wrote in only
        </label>
        <label>
          <input
            type="checkbox"
            name="plain-chips"
            checked={plainChips}
            onChange={(event) => setPlainChips(event.currentTarget.checked)}
          />{' '}
          Mentions without cards
        </label>
        <label>
          <input
            type="checkbox"
            name="pane"
            checked={pane}
            onChange={(event) => setPane(event.currentTarget.checked)}
          />{' '}
          Comments in the pane only
        </label>
        <button type="button" onClick={() => handle.current?.openThread('c0ffee01')}>
          Open the first thread
        </button>
        <button
          type="button"
          onClick={() =>
            handle.current?.openThread('c0ffee01', { entryId: 'e1', reply: 'From the detection.' })
          }
        >
          Answer the first comment
        </button>
        <button
          type="button"
          onClick={() => handle.current?.startComment({ text: 'Please confirm this.' })}
        >
          Ask to confirm the selection
        </button>
      </fieldset>
      <DocumentEditor
        state={state}
        onStateChange={setState}
        template={TEMPLATE}
        editable={!reading}
        handleRef={handle}
        aria-label="Sample document"
        comments={
          comments && {
            store: comments,
            documentId: 'lab',
            identity: HOST.identity,
            canComment: !reading,
            ...review,
            filter,
          }
        }
        events={{
          // Where the editor's caret is, so a test knows the editor took a click.
          onSelectionChange: (selection) => {
            document.documentElement.dataset.labCaret = `${String(selection.from)}-${String(selection.to)}`;
          },
        }}
      >
        {(panel || pane) && comments ? (
          <aside className="lab-panels">
            <DocumentCommentsPanel
              store={comments}
              documentId="lab"
              identity={HOST.identity}
              canComment={!reading}
              {...review}
            />
          </aside>
        ) : null}
      </DocumentEditor>
    </div>
  );
}

const container = document.querySelector('#lab-editor');
if (container) {
  createRoot(container).render(<Lab />);
  markReadyWhenSettled();
}
