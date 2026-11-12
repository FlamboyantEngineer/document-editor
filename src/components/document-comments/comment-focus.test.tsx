import { act, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { Harness, host, seen, thread } from '../../../test/comment-fixtures.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { listCommentAnchors } from '../../engine/index.js';
import { createMemoryHost } from '../../host/index.js';
import type { DocumentEditorHandle } from '../document-editor/editor-handle.js';

installEditorDom();

// A host whose open thread has a reply.
const answered = () =>
  createMemoryHost({
    person: { id: 'ada', name: 'Ada Lovelace' },
    comments: {
      threads: {
        doc: [
          {
            ...thread('open', 'open', 'Is blue right?'),
            entries: [
              ...thread('open', 'open', 'Is blue right?').entries,
              { id: 'open-2', author: 'ada', text: 'It is.', createdAt: '2026-01-03T03:04:05Z' },
            ],
          },
          thread('done', 'resolved', 'Old'),
        ],
      },
    },
  });

const panel = () => screen.getByRole('region', { name: 'All comments' });

describe('Comment focus', () => {
  it('DOCE-COMMENTS-4.7 shows threads only in the panel with pane placement, the new one too', async () => {
    const user = userEvent.setup();
    const handle = createRef<DocumentEditorHandle>();
    const store = host();
    render(
      <Harness
        host={store}
        select="gamma"
        handleRef={handle}
        options={{ placement: 'pane' }}
        panel={{ placement: 'pane' }}
      />,
    );
    await within(panel()).findByText('Is blue right?');
    expect(screen.queryByRole('list', { name: 'Comments' })).not.toBeInTheDocument();
    act(() => {
      expect(handle.current?.startComment()).toBe(true);
    });
    const composer = await within(panel()).findByRole('textbox', { name: /comment/i });
    await user.type(composer, 'From the pane');
    await user.click(within(panel()).getByRole('button', { name: 'Comment' }));
    expect(await within(panel()).findByText('From the pane')).toBeInTheDocument();
    const anchor =
      seen.state && listCommentAnchors(seen.state.doc).find((each) => each.text === 'gamma');
    expect(anchor?.state).toBe('open');
  });

  it('DOCE-COMMENTS-4.8 opens a thread at one of its comments, shown whatever the filter', async () => {
    const handle = createRef<DocumentEditorHandle>();
    render(<Harness host={answered()} handleRef={handle} panel />);
    const margin = screen.getByRole('list', { name: 'Comments' });
    await within(margin).findByText('It is.');
    act(() => {
      expect(handle.current?.openThread('open', { entryId: 'open-2' })).toBe(true);
    });
    const reply = within(panel()).getByText('It is.').closest('[data-highlighted]');
    expect(reply).toHaveAttribute('data-highlighted', 'true');
    await waitFor(() =>
      expect(within(panel()).getAllByRole('group', { name: 'Comment thread' })[0]).toHaveAttribute(
        'data-selected',
        'true',
      ),
    );
    // A resolved thread the reader is taken to shows in the margin, which hides resolved ones.
    act(() => {
      expect(handle.current?.openThread('done')).toBe(true);
    });
    expect(await within(margin).findByText('Old')).toBeInTheDocument();
    expect(handle.current?.openThread('missing')).toBe(false);
  });

  it('DOCE-COMMENTS-4.9 starts a thread and a reply with the text the host gives', async () => {
    const handle = createRef<DocumentEditorHandle>();
    render(<Harness host={host()} select="gamma" handleRef={handle} />);
    const margin = screen.getByRole('list', { name: 'Comments' });
    await within(margin).findByText('Is blue right?');
    act(() => {
      handle.current?.startComment({ text: 'Please check' });
    });
    expect(await within(margin).findByText('Please check')).toBeInTheDocument();
    act(() => {
      handle.current?.openThread('open', { reply: 'Agreed' });
    });
    const card = within(margin).getAllByRole('group', { name: 'Comment thread' })[0];
    if (!card) throw new Error('The open thread should show.');
    expect(await within(card).findByText('Agreed')).toBeInTheDocument();
  });
});
