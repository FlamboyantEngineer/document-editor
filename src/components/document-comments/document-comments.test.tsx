import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { EditorState, TextSelection } from 'prosemirror-state';
import { useEffect, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { createDocumentEditing, listCommentAnchors, listSuggestions } from '../../engine/index.js';
import { type CommentThread, createMemoryHost, type EditorHost } from '../../host/index.js';
import { readDocumentFile, type StoredNode, type TemplateFile } from '../../model/index.js';
import { DocumentEditor } from '../document-editor/document-editor.js';
import type { DocumentCommentsOptions } from './document-comments.js';

const TEMPLATE: TemplateFile = { formatVersion: 1, id: 'article' };

const text = (value: string, marks?: StoredNode['marks']): StoredNode => ({
  type: 'text',
  text: value,
  ...(marks ? { marks } : {}),
});

const thread = (id: string, state: CommentThread['state'], comment: string): CommentThread => ({
  id,
  state,
  quote: id === 'open' ? 'blue' : 'delta',
  suggestion: null,
  entries: [{ id: `${id}-1`, author: 'ada', text: comment, createdAt: '2026-01-02T03:04:05Z' }],
});

function initial(select?: string) {
  const doc = readDocumentFile(
    {
      formatVersion: 1,
      sections: [
        {
          name: null,
          content: [
            {
              type: 'paragraph',
              content: [
                text('Alpha '),
                text('blue', [{ type: 'comment', attrs: { thread: 'open', state: 'open' } }]),
                text(' gamma '),
                text('delta', [{ type: 'comment', attrs: { thread: 'done', state: 'resolved' } }]),
                text(' '),
                text('epsilon', [{ type: 'insertion', attrs: { id: 's1', author: 'ada' } }]),
              ],
            },
          ],
        },
      ],
    },
    documentSchema,
  ).doc;
  let selection: TextSelection | undefined;
  doc.descendants((node, pos) => {
    const at = select && node.isText ? (node.text?.indexOf(select) ?? -1) : -1;
    if (select && at >= 0)
      selection = TextSelection.create(doc, pos + at, pos + at + select.length);
    return !selection;
  });
  return EditorState.create({ doc, selection, plugins: createDocumentEditing(documentSchema) });
}

const host = () =>
  createMemoryHost({
    person: { id: 'ada', name: 'Ada Lovelace' },
    comments: {
      threads: {
        doc: [thread('open', 'open', 'Is blue right?'), thread('done', 'resolved', 'Old')],
      },
    },
  });

// The state the harness last committed, which the tests read the document from.
const seen: { state: EditorState | null } = { state: null };

function Harness(props: {
  host: EditorHost;
  select?: string;
  canComment?: boolean;
  editable?: boolean;
  decide?: DocumentCommentsOptions['decide'];
}) {
  const [state, setState] = useState(() => initial(props.select));
  useEffect(() => {
    seen.state = state;
  });
  const { comments, identity } = props.host;
  return (
    <DocumentEditor
      state={state}
      onStateChange={setState}
      template={TEMPLATE}
      layout="web"
      editable={props.editable}
      aria-label="Report"
      comments={
        comments
          ? {
              store: comments,
              documentId: 'doc',
              identity,
              canComment: props.canComment,
              decide: props.decide,
            }
          : undefined
      }
    />
  );
}

installEditorDom();

describe('DocumentComments', () => {
  it('DOCE-COMMENTS-2.1 shows open threads and suggestions beside the document, not resolved ones', async () => {
    render(<Harness host={host()} />);
    const margin = screen.getByRole('list', { name: 'Comments' });
    expect(await within(margin).findByText('Is blue right?')).toBeInTheDocument();
    // Authors' names come from the identity adapter once the threads are listed.
    expect(
      await within(margin).findByRole('heading', { name: 'Ada Lovelace' }),
    ).toBeInTheDocument();
    expect(within(margin).getByText('epsilon')).toBeInTheDocument();
    expect(within(margin).queryByText('Old')).not.toBeInTheDocument();
    expect(within(margin).getAllByRole('group', { name: 'Comment thread' })).toHaveLength(1);
    expect(within(margin).getByRole('button', { name: 'Accept' })).toBeInTheDocument();
  });

  it('DOCE-COMMENTS-2.2 starts a thread on the selected text', async () => {
    const user = userEvent.setup();
    const store = host();
    render(<Harness host={store} select="gamma" />);
    await user.click(await screen.findByRole('button', { name: 'Comment' }));
    await user.type(screen.getByRole('textbox', { name: 'Add a comment' }), 'Say more');
    await user.click(screen.getByRole('button', { name: 'Comment' }));
    expect(await screen.findByText('Say more')).toBeInTheDocument();
    const anchors = seen.state ? listCommentAnchors(seen.state.doc) : [];
    const anchor = anchors.find((each) => each.text === 'gamma');
    expect(anchor?.state).toBe('open');
    const stored = await store.comments?.list('doc');
    expect(stored).toMatchObject({
      value: expect.arrayContaining([
        expect.objectContaining({ id: anchor?.thread, quote: 'gamma', state: 'open' }),
      ]),
    });
  });

  it('DOCE-COMMENTS-2.2 cancelling a new thread removes its anchor', async () => {
    const user = userEvent.setup();
    render(<Harness host={host()} select="gamma" />);
    await user.click(await screen.findByRole('button', { name: 'Comment' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(seen.state && listCommentAnchors(seen.state.doc).map((each) => each.text)).toEqual([
      'blue',
      'delta',
    ]);
  });

  it('DOCE-COMMENTS-2.3 replies to and resolves a thread', async () => {
    const user = userEvent.setup();
    const store = host();
    render(<Harness host={store} />);
    const margin = screen.getByRole('list', { name: 'Comments' });
    await within(margin).findByText('Is blue right?');
    const first = screen.getByRole('group', { name: 'Comment thread' });
    await user.type(within(first).getByRole('textbox', { name: 'Reply' }), 'Yes');
    await user.click(within(first).getByRole('button', { name: 'Reply' }));
    expect(await within(margin).findByText('Yes')).toBeInTheDocument();
    await user.click(within(first).getByRole('button', { name: 'Resolve' }));
    await waitFor(() =>
      expect(within(margin).queryByText('Is blue right?')).not.toBeInTheDocument(),
    );
    expect(seen.state && listCommentAnchors(seen.state.doc)[0]).toMatchObject({
      thread: 'open',
      state: 'resolved',
    });
    await expect(store.comments?.list('doc')).resolves.toMatchObject({
      value: [{ id: 'open', state: 'resolved' }, { id: 'done' }],
    });
  });

  it('DOCE-COMMENTS-2.4 accepts a suggestion and discusses one in its own thread', async () => {
    const user = userEvent.setup();
    const store = host();
    render(<Harness host={store} />);
    const margin = screen.getByRole('list', { name: 'Comments' });
    const card = (await within(margin).findByText('epsilon')).closest('[role="listitem"]');
    if (!(card instanceof HTMLElement)) throw new Error('The suggestion should show.');
    expect(within(card).queryByRole('textbox')).not.toBeInTheDocument();
    await user.click(within(card).getByText('epsilon'));
    await user.type(within(card).getByRole('textbox', { name: 'Add a comment' }), 'Why add it?');
    await user.click(within(card).getByRole('button', { name: 'Comment' }));
    expect(await within(card).findByText('Why add it?')).toBeInTheDocument();
    const [suggestion] = seen.state ? listSuggestions(seen.state.doc) : [];
    expect(suggestion?.thread).toEqual(expect.any(String));
    await user.click(within(card).getByRole('button', { name: 'Accept' }));
    expect(seen.state && listSuggestions(seen.state.doc)).toEqual([]);
    expect(seen.state?.doc.textContent).toBe('Alpha blue gamma delta epsilon');
  });

  it('DOCE-COMMENTS-2.4 names the writer of a suggestion who wrote no comment', async () => {
    const store = createMemoryHost({
      person: { id: 'grace', name: 'Grace Hopper' },
      people: [{ id: 'ada', name: 'Ada Lovelace' }],
      comments: { threads: { doc: [] } },
    });
    render(<Harness host={store} />);
    const margin = screen.getByRole('list', { name: 'Comments' });
    const card = (await within(margin).findByText('epsilon')).closest('[role="listitem"]');
    if (!(card instanceof HTMLElement)) throw new Error('The suggestion should show.');
    expect(await within(card).findByText('Ada Lovelace')).toBeInTheDocument();
    expect(within(card).queryByText('ada')).not.toBeInTheDocument();
  });

  it('DOCE-COMMENTS-2.10 offers only the decisions the host allows on a suggestion', async () => {
    render(
      <Harness
        host={host()}
        decide={(suggestion, me) => ({ accept: suggestion.author !== me, reject: true })}
      />,
    );
    const margin = screen.getByRole('list', { name: 'Comments' });
    const card = (await within(margin).findByText('epsilon')).closest('[role="listitem"]');
    if (!(card instanceof HTMLElement)) throw new Error('The suggestion should show.');
    expect(within(card).queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Reject' })).toBeInTheDocument();
  });

  it('DOCE-COMMENTS-2.5 shows threads read-only to a reader who may not comment or decide', async () => {
    render(<Harness host={host()} canComment={false} editable={false} select="gamma" />);
    const margin = screen.getByRole('list', { name: 'Comments' });
    await within(margin).findByText('Is blue right?');
    expect(within(margin).queryByRole('textbox')).not.toBeInTheDocument();
    expect(
      within(margin).queryByRole('button', { name: /Comment|Accept|Resolve/ }),
    ).not.toBeInTheDocument();
  });
});
