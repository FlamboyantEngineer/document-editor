import { act, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { type Command, TextSelection } from 'prosemirror-state';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Harness, host, PARAGRAPH, seen, text, thread } from '../../../test/comment-fixtures.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import {
  clearCommentDraft,
  commentDraft,
  listCommentAnchors,
  listSuggestions,
} from '../../engine/index.js';
import { type CommentStoreAdapter, createMemoryHost } from '../../host/index.js';
import type { DocumentEditorHandle } from '../document-editor/editor-handle.js';

installEditorDom();

// Selects the first occurrence of some text.
const selectText =
  (wanted: string): Command =>
  (state, dispatch) => {
    let found: number | null = null;
    state.doc.descendants((node, pos) => {
      const at = node.isText ? (node.text ?? '').indexOf(wanted) : -1;
      if (found === null && at >= 0) found = pos + at;
    });
    if (found === null) return false;
    dispatch?.(
      state.tr.setSelection(TextSelection.create(state.doc, found, found + wanted.length)),
    );
    return true;
  };

// Deletes the text of the thread being started, as a collaborator's change may.
const deleteDraftText: Command = (state, dispatch) => {
  const draft = commentDraft(state);
  if (!draft) return false;
  dispatch?.(state.tr.delete(draft.from, draft.to));
  return true;
};

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

  it('DOCE-COMMENTS-2.2 removes a thread stored after its text was deleted, and keeps no draft for the next', async () => {
    const user = userEvent.setup();
    const made = host();
    const store = made.comments;
    if (!store) throw new Error('The host should keep comments.');
    let stored: (() => void) | null = null;
    const held: CommentStoreAdapter = {
      ...store,
      create: (documentId, thread) =>
        new Promise((resolve) => {
          stored = () => void store.create(documentId, thread).then(resolve);
        }),
    };
    const handle = createRef<DocumentEditorHandle>();
    render(<Harness host={{ ...made, comments: held }} select="gamma" handleRef={handle} />);
    await user.click(await screen.findByRole('button', { name: 'Comment' }));
    await user.type(screen.getByRole('textbox', { name: 'Add a comment' }), 'Say more');
    await user.click(screen.getByRole('button', { name: 'Comment' }));
    await waitFor(() => expect(stored).not.toBeNull());
    // A collaborator deletes the quoted text while the thread is stored.
    act(() => {
      handle.current?.run(deleteDraftText);
    });
    act(() => stored?.());
    await waitFor(async () => {
      const listed = await store.list('doc');
      expect(listed.ok && listed.value.map((each) => each.id)).toEqual(['open', 'done']);
    });
    expect(seen.state && listCommentAnchors(seen.state.doc).map((each) => each.text)).toEqual([
      'blue',
      'delta',
    ]);
  });

  it('DOCE-COMMENTS-2.12 keeps the text typed for a thread being started to that thread', async () => {
    const user = userEvent.setup();
    const handle = createRef<DocumentEditorHandle>();
    render(<Harness host={host()} select="gamma" handleRef={handle} />);
    await user.click(await screen.findByRole('button', { name: 'Comment' }));
    await user.type(screen.getByRole('textbox', { name: 'Add a comment' }), 'For gamma');
    // The thread is left without Cancel, and another is started elsewhere.
    act(() => {
      handle.current?.run(clearCommentDraft);
      handle.current?.run(selectText('Alpha'));
    });
    await user.click(await screen.findByRole('button', { name: 'Comment' }));
    expect(screen.getByRole('textbox', { name: 'Add a comment' })).toHaveTextContent('');
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

  it('DOCE-COMMENTS-2.3 hands keyboard focus to the next card when a resolved thread’s card goes', async () => {
    const user = userEvent.setup();
    render(<Harness host={host()} />);
    const margin = screen.getByRole('list', { name: 'Comments' });
    await within(margin).findByText('Is blue right?');
    await user.click(within(margin).getByRole('button', { name: 'Resolve' }));
    await waitFor(() =>
      expect(within(margin).queryByText('Is blue right?')).not.toBeInTheDocument(),
    );
    // The suggestion's card is the one after the thread's.
    const next = within(margin).getByText('epsilon').closest('[role="listitem"]');
    await waitFor(() => expect(next).toHaveFocus());
  });

  it('DOCE-COMMENTS-2.15 shows a refused Resolve on the thread, which stays open', async () => {
    const user = userEvent.setup();
    const made = host();
    if (!made.comments) throw new Error('The host should keep comments.');
    const refusing: CommentStoreAdapter = {
      ...made.comments,
      setState: () => Promise.resolve({ ok: false, error: { kind: 'denied', message: 'No.' } }),
    };
    render(<Harness host={{ ...made, comments: refusing }} />);
    const margin = screen.getByRole('list', { name: 'Comments' });
    await within(margin).findByText('Is blue right?');
    await user.click(within(margin).getByRole('button', { name: 'Resolve' }));
    expect(await within(margin).findAllByText('No.')).not.toHaveLength(0);
    expect(within(margin).getByText('Is blue right?')).toBeInTheDocument();
    expect(seen.state && listCommentAnchors(seen.state.doc)[0]).toMatchObject({ state: 'open' });
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

  it('DOCE-COMMENTS-2.14 shares one thread state between the margin and the panel', async () => {
    const user = userEvent.setup();
    const store = host();
    const comments = store.comments;
    if (!comments) throw new Error('The host should keep comments.');
    // A store that lists threads but tells no one of changes, so only shared state shows them.
    const list = vi.fn(comments.list.bind(comments));
    const quiet = { ...comments, list, subscribe: undefined };
    render(<Harness host={{ ...store, comments: quiet }} panel />);
    const margin = screen.getByRole('list', { name: 'Comments' });
    const panel = screen.getByRole('region', { name: 'All comments' });
    await within(margin).findByText('Is blue right?');
    const [thread] = within(panel).getAllByRole('group', { name: 'Comment thread' });
    if (!thread) throw new Error('The panel should list the open thread.');
    await user.type(within(thread).getByRole('textbox', { name: 'Reply' }), 'From the panel');
    await user.click(within(thread).getByRole('button', { name: 'Reply' }));
    expect(await within(margin).findByText('From the panel')).toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('DOCE-COMMENTS-4.3 reads comments as inline Markdown when asked', async () => {
    const store = createMemoryHost({
      person: { id: 'ada', name: 'Ada Lovelace' },
      comments: { threads: { doc: [thread('open', 'open', 'Is **blue** `right`?')] } },
    });
    render(<Harness host={store} options={{ format: 'markdown-inline' }} />);
    const margin = screen.getByRole('list', { name: 'Comments' });
    const strong = await within(margin).findByText('blue', { selector: 'strong' });
    expect(strong).toBeInTheDocument();
    expect(within(margin).getByText('right', { selector: 'code' })).toBeInTheDocument();
  });

  it('DOCE-COMMENTS-4.4 opens a person’s card from a mention’s chip', async () => {
    const user = userEvent.setup();
    const store = createMemoryHost({
      person: { id: 'ada', name: 'Ada Lovelace' },
      comments: {
        threads: { doc: [thread('open', 'open', 'Ask @[Ada Lovelace](ada) first')] },
      },
    });
    render(<Harness host={store} />);
    const margin = screen.getByRole('list', { name: 'Comments' });
    await within(margin).findByText(/first/);
    await user.click(within(margin).getByRole('button', { name: 'Ada Lovelace' }));
    expect(await screen.findByRole('dialog', { name: 'Ada Lovelace' })).toBeInTheDocument();
  });

  it('DOCE-COMMENTS-4.4 shows a mention as a plain chip without a card when asked', async () => {
    const store = createMemoryHost({
      person: { id: 'ada', name: 'Ada Lovelace' },
      comments: {
        threads: { doc: [thread('open', 'open', 'Ask @[Ada Lovelace](ada) first')] },
      },
    });
    render(<Harness host={store} options={{ mentionCard: null }} />);
    const margin = screen.getByRole('list', { name: 'Comments' });
    await within(margin).findByText(/first/);
    expect(within(margin).queryByRole('button', { name: 'Ada Lovelace' })).not.toBeInTheDocument();
  });

  it('DOCE-COMMENTS-4.5 names a suggestion of whitespace alone', async () => {
    render(
      <Harness
        host={host()}
        content={[
          ...PARAGRAPH.slice(0, 5),
          text('  ', [{ type: 'insertion', attrs: { id: 's1', author: 'ada' } }]),
        ]}
      />,
    );
    const margin = screen.getByRole('list', { name: 'Comments' });
    expect(await within(margin).findByText('(2 spaces)')).toBeInTheDocument();
  });

  it('DOCE-COMMENTS-2.19 records a decision once on the thread of the suggestion in the store', async () => {
    const user = userEvent.setup();
    const store = host();
    if (!store.comments?.decide) throw new Error('The store should record decisions.');
    const decide = vi.spyOn(store.comments, 'decide');
    render(<Harness host={store} />);
    const margin = screen.getByRole('list', { name: 'Comments' });
    const card = (await within(margin).findByText('epsilon')).closest('[role="listitem"]');
    if (!(card instanceof HTMLElement)) throw new Error('The suggestion should show.');
    await user.click(within(card).getByText('epsilon'));
    await user.type(within(card).getByRole('textbox', { name: 'Add a comment' }), 'Hmm');
    await user.click(within(card).getByRole('button', { name: 'Comment' }));
    await within(card).findByText('Hmm');
    await user.click(within(card).getByRole('button', { name: 'Reject' }));
    await waitFor(async () => {
      const listed = await store.comments?.list('doc');
      const decided = listed?.ok ? listed.value.find((each) => each.suggestion === 's1') : null;
      expect(decided).toMatchObject({
        state: 'resolved',
        decision: { decision: 'reject', suggestion: 's1', by: 'ada' },
      });
    });
    expect(decide).toHaveBeenCalledTimes(1);
  });

  it('DOCE-COMMENTS-2.15 DOCE-COMMENTS-2.17 shows a refused reply on the card of its suggestion', async () => {
    const user = userEvent.setup();
    const made = createMemoryHost({
      person: { id: 'ada', name: 'Ada Lovelace' },
      comments: {
        threads: { doc: [{ ...thread('about', 'open', 'Why epsilon?'), suggestion: 's1' }] },
      },
    });
    if (!made.comments) throw new Error('The host should keep comments.');
    const refusing: CommentStoreAdapter = {
      ...made.comments,
      reply: () =>
        Promise.resolve({ ok: false, error: { kind: 'unavailable', message: 'Offline.' } }),
    };
    render(
      <Harness
        host={{ ...made, comments: refusing }}
        content={[
          text('Alpha '),
          text('epsilon', [
            { type: 'insertion', attrs: { id: 's1', author: 'ada', thread: 'about' } },
          ]),
        ]}
      />,
    );
    const margin = screen.getByRole('list', { name: 'Comments' });
    const card = (await within(margin).findByText('Why epsilon?')).closest('[role="listitem"]');
    if (!(card instanceof HTMLElement)) throw new Error('The suggestion should show its thread.');
    await user.type(within(card).getByRole('textbox', { name: 'Reply' }), 'Because');
    await user.click(within(card).getByRole('button', { name: 'Reply' }));
    // The row says why, and is announced too.
    expect(await within(card).findAllByText('Offline.')).not.toHaveLength(0);
    expect(within(card).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it.each([
    ['margin', {}],
    ['pane', { placement: 'pane' as const }],
  ])(
    'DOCE-COMMENTS-2.21 starts a thread for the reader’s own suggestion once they pause, in the %s',
    async (_where, placed) => {
      const store = host();
      render(<Harness host={store} options={{ suggestionThreads: { delay: 0 }, ...placed }} />);
      await waitFor(() =>
        expect(seen.state && listSuggestions(seen.state.doc)[0]?.thread).toEqual(
          expect.any(String),
        ),
      );
      const [suggestion] = seen.state ? listSuggestions(seen.state.doc) : [];
      const listed = await store.comments?.list('doc');
      expect(
        listed?.ok && listed.value.find((each) => each.id === suggestion?.thread),
      ).toMatchObject({
        suggestion: 's1',
        quote: 'epsilon',
        automatic: true,
        change: { kind: 'insert', inserted: 'epsilon' },
        entries: [],
      });
    },
  );

  it('DOCE-COMMENTS-4.11 offers the host’s own actions in a comment’s menu', async () => {
    const user = userEvent.setup();
    const copied: string[] = [];
    render(
      <Harness
        host={host()}
        options={{
          commentActions: ({ thread, entry, index }) => [
            {
              id: 'copy-link',
              label: index === 0 ? 'Copy link to thread' : 'Copy link',
              onAction: () => copied.push(`${thread.id}/${entry.id}`),
            },
          ],
        }}
      />,
    );
    const margin = screen.getByRole('list', { name: 'Comments' });
    const comment = (await within(margin).findByText('Is blue right?')).closest('article');
    if (!(comment instanceof HTMLElement)) throw new Error('The comment should show.');
    await user.click(within(comment).getByRole('button', { name: /actions|more/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Copy link to thread' }));
    expect(copied).toEqual(['open/open-1']);
  });

  it('DOCE-COMMENTS-2.22 offers only what the host allows in a thread', async () => {
    render(
      <Harness
        host={host()}
        options={{
          threadPermissions: (thread) => ({ resolve: thread.id !== 'open', react: false }),
        }}
      />,
    );
    const margin = screen.getByRole('list', { name: 'Comments' });
    await within(margin).findByText('Is blue right?');
    const first = screen.getByRole('group', { name: 'Comment thread' });
    expect(within(first).getByRole('textbox', { name: 'Reply' })).toBeInTheDocument();
    expect(within(first).queryByRole('button', { name: 'Resolve' })).not.toBeInTheDocument();
  });
});
