import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Harness, host } from '../../../test/comment-fixtures.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import type { CommentStoreAdapter, EditorHost } from '../../host/index.js';

installEditorDom();

type Call = readonly [string, ...unknown[]];

// The in-memory host with its comment store wrapped, recording each change the editor asks of it.
function tracedHost(): { traced: EditorHost; calls: Call[] } {
  const store = host();
  const comments = store.comments as CommentStoreAdapter;
  const calls: Call[] = [];
  const traced: CommentStoreAdapter = {
    ...comments,
    create: (documentId, thread) => {
      calls.push(['create', documentId, thread]);
      return comments.create(documentId, thread);
    },
    reply: (documentId, reply) => {
      calls.push(['reply', documentId, reply]);
      return comments.reply(documentId, reply);
    },
    setState: (documentId, threadId, state) => {
      calls.push(['setState', documentId, threadId, state]);
      return comments.setState(documentId, threadId, state);
    },
  };
  return { traced: { ...store, comments: traced }, calls };
}

describe('Comment store seams', () => {
  it('DOCE-HOST-1.5 asks the host’s store for every change, with the editor’s ids and plain text', async () => {
    const user = userEvent.setup();
    const { traced, calls } = tracedHost();
    render(<Harness host={traced} select="gamma" options={{ filter: 'all' }} />);
    const margin = screen.getByRole('list', { name: 'Comments' });
    await user.click(await screen.findByRole('button', { name: 'Comment' }));
    await user.type(screen.getByRole('textbox', { name: 'Add a comment' }), 'Say **more**');
    await user.click(screen.getByRole('button', { name: 'Comment' }));
    const card = (await within(margin).findByText('Say **more**')).closest('[role="group"]');
    if (!(card instanceof HTMLElement)) throw new Error('The new thread should show.');
    await user.click(within(card).getByText('Say **more**'));
    await user.type(within(card).getByRole('textbox', { name: 'Reply' }), 'Yes');
    await user.click(within(card).getByRole('button', { name: 'Reply' }));
    await within(card).findByText('Yes');
    await user.click(within(card).getByRole('button', { name: 'Resolve' }));
    await user.click(await within(card).findByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Reopen' }));
    await waitFor(() => expect(calls.at(-1)?.[3]).toBe('open'));
    const [created] = calls;
    const id = (created?.[2] as { id: string }).id;
    expect(id).toMatch(/\S/);
    expect(calls.map(([kind, documentId]) => [kind, documentId])).toEqual([
      ['create', 'doc'],
      ['reply', 'doc'],
      ['setState', 'doc'],
      ['setState', 'doc'],
    ]);
    expect(created?.[2]).toMatchObject({ id, quote: 'gamma', text: 'Say **more**' });
    expect(calls[1]).toEqual([
      'reply',
      'doc',
      { threadId: id, text: 'Yes', id: expect.any(String) },
    ]);
    expect(calls.slice(2).map((call) => call.slice(2))).toEqual([
      [id, 'resolved'],
      [id, 'open'],
    ]);
    // What the editor sends is the reader's text and the quote, never the document's markup.
    expect(JSON.stringify(calls)).not.toMatch(/<[a-z]/i);
  });

  it('DOCE-COMMENTS-2.33 holds Resolve pending while the store answers, asking it once', async () => {
    const user = userEvent.setup();
    const store = host();
    const comments = store.comments as CommentStoreAdapter;
    let answer: () => void = () => undefined;
    const asked: string[] = [];
    const slow: CommentStoreAdapter = {
      ...comments,
      setState: (documentId, threadId, state) => {
        asked.push(state);
        return new Promise((resolve) => {
          answer = () => resolve(comments.setState(documentId, threadId, state));
        });
      },
    };
    render(<Harness host={{ ...store, comments: slow }} />);
    const margin = screen.getByRole('list', { name: 'Comments' });
    const card = (await within(margin).findByText('Is blue right?')).closest('[role="group"]');
    if (!(card instanceof HTMLElement)) throw new Error('The thread should show.');
    const resolve = within(card).getByRole('button', { name: 'Resolve' });
    await user.click(resolve);
    expect(within(resolve).getByRole('progressbar')).toBeInTheDocument();
    await user.click(resolve);
    expect(asked).toEqual(['resolved']);
    answer();
    await waitFor(() =>
      expect(within(margin).queryByText('Is blue right?')).not.toBeInTheDocument(),
    );
  });
});
