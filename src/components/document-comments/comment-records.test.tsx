import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Harness, seen, thread } from '../../../test/comment-fixtures.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { listCommentAnchors } from '../../engine/index.js';
import {
  type CommentEntry,
  type CommentStoreAdapter,
  type CommentThread,
  createMemoryHost,
} from '../../host/index.js';

installEditorDom();

const margin = () => screen.getByRole('list', { name: 'Comments' });

// Chooses an action from a comment's menu, the opening comment's being its thread's header menu,
// confirming a deletion.
async function act(user: ReturnType<typeof userEvent.setup>, text: string, action: string) {
  const comment = (await within(margin()).findByText(text)).closest('article');
  const card = comment?.closest('[role="group"]');
  if (!(comment instanceof HTMLElement) || !(card instanceof HTMLElement)) {
    throw new Error(`No comment says ${text}`);
  }
  const menu =
    within(comment).queryByRole('button', { name: /actions|more/i }) ??
    within(card).getByRole('button', { name: 'More actions' });
  await user.click(menu);
  await user.click(await screen.findByRole('menuitem', { name: action }));
  const dialog = screen.queryByRole('alertdialog') ?? screen.queryByRole('dialog');
  if (dialog) await user.click(within(dialog).getByRole('button', { name: action }));
}

// A host whose open thread has these comments after its opening one, and which settles replies.
function hostWith(entries: CommentEntry[], fields: Partial<CommentThread> = {}) {
  const open = thread('open', 'open', 'Is blue right?');
  const host = createMemoryHost({
    person: { id: 'ada', name: 'Ada Lovelace' },
    comments: {
      threads: { doc: [{ ...open, ...fields, entries: [...open.entries, ...entries] }] },
    },
  });
  const store = host.comments as CommentStoreAdapter;
  // Settling is not what these tests follow; a store that offers it shows Cancel and Retry.
  const settleEntry: CommentStoreAdapter['settleEntry'] = () =>
    Promise.resolve({ ok: false, error: { kind: 'denied' } });
  return { host: { ...host, comments: { ...store, settleEntry } } };
}

const failed = (fields: Partial<CommentEntry>): CommentEntry => ({
  id: 'a1',
  author: 'ada',
  text: 'No model is set up.',
  createdAt: '2026-01-02T03:05:00Z',
  status: 'failed',
  ...fields,
});

describe('Comment records', () => {
  it('DOCE-COMMENTS-2.26 offers no Retry on a reply the store decided is final', async () => {
    const { host } = hostWith([failed({ retryable: false })]);
    render(<Harness host={host} />);
    const thread = await within(margin()).findByRole('group', { name: 'Comment thread' });
    expect(await within(thread).findAllByText('No model is set up.')).not.toHaveLength(0);
    expect(within(thread).queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('DOCE-COMMENTS-2.26 offers Retry on a failed reply by default', async () => {
    const { host } = hostWith([failed({})]);
    render(<Harness host={host} />);
    const thread = await within(margin()).findByRole('group', { name: 'Comment thread' });
    expect(await within(thread).findByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('DOCE-COMMENTS-2.27 names the assistant that wrote a comment or started a thread, and keeps meta', async () => {
    const { host } = hostWith(
      [{ id: 'a2', author: 'ada', text: 'Blue fits.', createdAt: '', agent: 'helper' }],
      { agent: 'helper', meta: { review: 'pending' } },
    );
    render(<Harness host={host} />);
    const thread = await within(margin()).findByRole('group', { name: 'Comment thread' });
    const reply = await within(thread).findByText('Blue fits.');
    expect(reply.closest('article')).toHaveAttribute('data-agent', 'helper');
    expect(thread.closest('[data-agent]')).toHaveAttribute('data-agent', 'helper');
    const listed = await host.comments.list('doc');
    expect(listed.ok && listed.value[0]?.meta).toEqual({ review: 'pending' });
  });

  it('DOCE-COMMENTS-2.28 tells the host once when a reply being written for the reader is drawn', async () => {
    const { host } = hostWith([{ ...failed({}), status: 'pending', text: '' }]);
    const shown = vi.fn();
    const { rerender } = render(<Harness host={host} options={{ onActivityShown: shown }} />);
    await waitFor(() => expect(shown).toHaveBeenCalledWith({ threadId: 'open', entryId: 'a1' }));
    rerender(<Harness host={host} options={{ onActivityShown: shown }} />);
    await new Promise((done) => setTimeout(done, 50));
    expect(shown).toHaveBeenCalledTimes(1);
  });

  it('DOCE-COMMENTS-2.29 starts a reply with the text the host gives, unless the reader may not reply', async () => {
    const user = userEvent.setup();
    const { host } = hostWith([]);
    const replyStart = vi.fn((_thread: CommentThread, me: string) => `@helper for ${me} `);
    const { unmount } = render(<Harness host={host} options={{ replyStart }} />);
    const thread = await within(margin()).findByRole('group', { name: 'Comment thread' });
    await user.click(within(thread).getByText('Is blue right?'));
    const box = within(thread).getByRole('textbox', { name: 'Reply' });
    await waitFor(() => expect(box).toHaveTextContent('@helper for ada'));
    unmount();
    render(<Harness host={hostWith([]).host} canComment={false} options={{ replyStart }} />);
    const readOnly = await within(margin()).findByRole('group', { name: 'Comment thread' });
    expect(
      within(readOnly).queryByRole('textbox', { name: 'Reply', hidden: true }),
    ).not.toBeInTheDocument();
  });

  it('DOCE-COMMENTS-2.32 keeps a deleted reply and a deleted thread as records, shown nowhere', async () => {
    const user = userEvent.setup();
    const { host } = hostWith([
      { id: 'r1', author: 'ada', text: 'Still unsure.', createdAt: '2026-01-02T03:06:00Z' },
    ]);
    render(<Harness host={host} />);
    await act(user, 'Still unsure.', 'Delete');
    await waitFor(() =>
      expect(within(margin()).queryByText('Still unsure.')).not.toBeInTheDocument(),
    );
    await act(user, 'Is blue right?', 'Delete');
    await waitFor(() =>
      expect(within(margin()).queryByText('Is blue right?')).not.toBeInTheDocument(),
    );
    const listed = await host.comments.list('doc');
    const kept = listed.ok ? listed.value.find((each) => each.id === 'open') : undefined;
    expect(kept).toMatchObject({ state: 'deleted', deletedBy: 'ada' });
    expect(kept?.entries[1]).toMatchObject({ text: 'Still unsure.', deletedBy: 'ada' });
    // The anchor stays in the document, marked deleted, and is no anchor of the editor's.
    const mark = screen
      .getByRole('textbox', { name: 'Report' })
      .querySelector('mark[data-comment-id="open"]');
    expect(mark).toHaveAttribute('data-comment-state', 'deleted');
    expect(seen.state && listCommentAnchors(seen.state.doc).map((each) => each.thread)).toEqual([
      'done',
    ]);
  });
});
