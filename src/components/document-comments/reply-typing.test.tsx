import { act, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Harness, thread } from '../../../test/comment-fixtures.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { type CommentStoreAdapter, createMemoryHost } from '../../host/index.js';
import { TYPING_IDLE_MS } from './use-typing-signal.js';

installEditorDom();

// A host with one open thread whose store hears the reader writing.
function typingHost() {
  const host = createMemoryHost({
    person: { id: 'ada', name: 'Ada Lovelace' },
    comments: { threads: { doc: [thread('open', 'open', 'Is blue right?')] } },
  });
  const setTyping = vi.fn<NonNullable<CommentStoreAdapter['setTyping']>>();
  const store = host.comments as CommentStoreAdapter;
  return { host: { ...host, comments: { ...store, setTyping } }, setTyping };
}

async function replyBox(user: ReturnType<typeof userEvent.setup>) {
  const card = await within(screen.getByRole('list', { name: 'Comments' })).findByRole('group', {
    name: 'Comment thread',
  });
  await user.click(within(card).getByText('Is blue right?'));
  return { card, box: within(card).getByRole('textbox', { name: 'Reply' }) };
}

describe('Telling others the reader is writing', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('DOCE-COMMENTS-2.38 tells the store once when a reply starts and again when it is posted', async () => {
    const user = userEvent.setup();
    const { host, setTyping } = typingHost();
    render(<Harness host={host} />);
    const { card, box } = await replyBox(user);
    await user.type(box, 'Yes');
    expect(setTyping.mock.calls).toEqual([['doc', 'open', true]]);
    await user.click(within(card).getByRole('button', { name: 'Reply' }));
    await waitFor(() => expect(setTyping).toHaveBeenLastCalledWith('doc', 'open', false));
    expect(setTyping).toHaveBeenCalledTimes(2);
  });

  it('DOCE-COMMENTS-2.38 stops once the draft is left alone, and when the card goes', async () => {
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { host, setTyping } = typingHost();
    const { unmount } = render(<Harness host={host} />);
    const { box } = await replyBox(user);
    await user.type(box, 'Maybe');
    expect(setTyping).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(TYPING_IDLE_MS);
    });
    expect(setTyping).toHaveBeenLastCalledWith('doc', 'open', false);
    await user.type(box, '!');
    expect(setTyping).toHaveBeenLastCalledWith('doc', 'open', true);
    unmount();
    expect(setTyping).toHaveBeenLastCalledWith('doc', 'open', false);
    expect(setTyping).toHaveBeenCalledTimes(4);
  });
});
