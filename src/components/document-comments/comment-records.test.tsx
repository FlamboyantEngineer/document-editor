import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Harness, thread } from '../../../test/comment-fixtures.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import {
  type CommentEntry,
  type CommentStoreAdapter,
  type CommentThread,
  createMemoryHost,
} from '../../host/index.js';

installEditorDom();

const margin = () => screen.getByRole('list', { name: 'Comments' });

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
    const { host } = hostWith([]);
    const replyStart = vi.fn((_thread: CommentThread, me: string) => `@helper for ${me} `);
    const { unmount } = render(<Harness host={host} options={{ replyStart }} />);
    const thread = await within(margin()).findByRole('group', { name: 'Comment thread' });
    const box = within(thread).getByRole('textbox', { name: 'Reply' });
    await waitFor(() => expect(box).toHaveTextContent('@helper for ada'));
    unmount();
    render(<Harness host={hostWith([]).host} canComment={false} options={{ replyStart }} />);
    const readOnly = await within(margin()).findByRole('group', { name: 'Comment thread' });
    expect(within(readOnly).queryByRole('textbox', { name: 'Reply' })).not.toBeInTheDocument();
  });
});
