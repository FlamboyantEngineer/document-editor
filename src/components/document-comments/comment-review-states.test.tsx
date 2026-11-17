import { act, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { Command } from 'prosemirror-state';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { Harness, host, seen, thread } from '../../../test/comment-fixtures.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { acceptSuggestion, listCommentAnchors, markRemote } from '../../engine/index.js';
import { createHistoricalComments } from '../../host/historical-comments.js';
import { type CommentStoreAdapter, createMemoryHost, type EditorHost } from '../../host/index.js';
import type { DocumentEditorHandle } from '../document-editor/editor-handle.js';

installEditorDom();

const panel = () => screen.getByRole('region', { name: 'All comments' });
const margin = () => screen.getByRole('list', { name: 'Comments' });
const pane = { placement: 'pane' } as const;

// The text of each thread card the panel lists, in order.
const listedTexts = () =>
  within(panel())
    .getAllByRole('group', { name: 'Comment thread' })
    .map((card) => card.textContent ?? '');

// The host as a version's view gives it: the discussion captured with the version, read-only.
function historical(): EditorHost {
  const live = host();
  const answered = {
    ...thread('done', 'resolved', 'Old'),
    entries: [
      ...thread('done', 'resolved', 'Old').entries,
      { id: 'done-2', author: 'ada', text: 'Fixed.', createdAt: '2026-01-03T03:04:05Z' },
    ],
  };
  return {
    ...live,
    comments: createHistoricalComments('doc', [thread('open', 'open', 'Is blue right?'), answered]),
  };
}

describe('Comments in review states', () => {
  it('DOCE-COMMENTS-4.2 filters a version’s threads without offering any change', async () => {
    const user = userEvent.setup();
    const reader = { canComment: false, canDecide: false };
    render(<Harness host={historical()} editable={false} canComment={false} panel={reader} />);
    await within(panel()).findByText('Is blue right?');
    expect(within(panel()).queryByText('Fixed.')).not.toBeInTheDocument();
    const filter = within(panel()).getByRole('radiogroup', { name: 'Show' });
    await user.click(within(filter).getByRole('radio', { name: /All/ }));
    // The resolved thread with its reply, and still nothing to change.
    expect(await within(panel()).findByText('Fixed.')).toBeInTheDocument();
    for (const name of ['Resolve', 'Reopen', 'Accept', 'Reject', 'Edit', 'Delete'])
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Reply' })).not.toBeInTheDocument();
    await user.click(within(filter).getByRole('radio', { name: /Open/ }));
    await waitFor(() => expect(within(panel()).queryByText('Fixed.')).not.toBeInTheDocument());
  });

  it('DOCE-COMMENTS-4.7 lists a thread started on earlier text first in the pane', async () => {
    const user = userEvent.setup();
    const handle = createRef<DocumentEditorHandle>();
    render(<Harness host={host()} select="Alpha" handleRef={handle} options={pane} panel={pane} />);
    await within(panel()).findByText('Is blue right?');
    act(() => {
      expect(handle.current?.startComment()).toBe(true);
    });
    await user.type(await within(panel()).findByRole('textbox', { name: /comment/i }), 'First');
    await user.click(within(panel()).getByRole('button', { name: 'Comment' }));
    await waitFor(() => expect(listedTexts()[0]).toContain('First'));
    expect(listedTexts()[1]).toContain('Is blue right?');
  });

  it('DOCE-COMMENTS-4.7 takes a deleted thread’s highlight away with it in the pane', async () => {
    const user = userEvent.setup();
    const quiet = { ...pane, confirmsDelete: false };
    render(<Harness host={host()} options={quiet} panel={quiet} />);
    const card = (await within(panel()).findByText('Is blue right?')).closest('[role="group"]');
    if (!(card instanceof HTMLElement)) throw new Error('The open thread should be listed.');
    await user.click(within(card).getByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await waitFor(() =>
      expect(within(panel()).queryByText('Is blue right?')).not.toBeInTheDocument(),
    );
    expect(seen.state && listCommentAnchors(seen.state.doc).map((each) => each.thread)).toEqual([
      'done',
    ]);
  });

  it('DOCE-COMMENTS-2.15 keeps a refused thread’s text in its composer, saying why, until it is kept', async () => {
    const user = userEvent.setup();
    const live = host();
    const store = live.comments as CommentStoreAdapter;
    let refuse = true;
    const flaky: EditorHost = {
      ...live,
      comments: {
        ...store,
        create: (documentId, made) =>
          refuse
            ? Promise.resolve({ ok: false, error: { kind: 'unavailable', message: 'Offline.' } })
            : store.create(documentId, made),
      },
    };
    render(<Harness host={flaky} select="gamma" />);
    await user.click(await screen.findByRole('button', { name: 'Comment' }));
    await user.keyboard('Say more');
    await user.click(within(margin()).getByRole('button', { name: 'Comment' }));
    expect(await within(margin()).findByText(/Offline\./)).toBeInTheDocument();
    expect(within(margin()).getByRole('textbox', { name: 'Add a comment' })).toHaveTextContent(
      'Say more',
    );
    refuse = false;
    await user.click(within(margin()).getByRole('button', { name: 'Comment' }));
    expect(await within(margin()).findByText('Say more')).toBeInTheDocument();
    expect(within(margin()).queryByText(/Offline\./)).not.toBeInTheDocument();
  });

  it('DOCE-COMMENTS-2.34 takes a decision or Resolve on a card that is not selected at the first press', async () => {
    const user = userEvent.setup();
    const store = createMemoryHost({
      person: { id: 'ada', name: 'Ada Lovelace' },
      comments: { threads: { doc: [thread('open', 'open', 'Is blue right?')] } },
    });
    render(<Harness host={store} />);
    const card = (await within(margin()).findByText('Is blue right?')).closest('[role="group"]');
    if (!(card instanceof HTMLElement)) throw new Error('The open thread should show.');
    expect(card.closest('[data-selected="true"]')).toBeNull();
    await user.click(within(card).getByRole('button', { name: 'Resolve' }));
    await waitFor(() =>
      expect(within(margin()).queryByText('Is blue right?')).not.toBeInTheDocument(),
    );
    await user.click(await within(margin()).findByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(seen.state?.doc.textContent).toBe('Alpha blue gamma delta epsilon'));
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
  });

  it('DOCE-COMMENTS-2.18 takes a suggestion’s card away when another writer decides it', async () => {
    const handle = createRef<DocumentEditorHandle>();
    render(<Harness host={host()} handleRef={handle} />);
    expect(await within(margin()).findByRole('button', { name: 'Accept' })).toBeInTheDocument();
    // The decision arrives as another writer's change.
    const remotely: Command = (state, dispatch) =>
      acceptSuggestion('s1')(state, (tr) => dispatch?.(markRemote(tr)));
    act(() => {
      handle.current?.run(remotely);
    });
    await waitFor(() =>
      expect(within(margin()).queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument(),
    );
    expect(seen.state?.doc.textContent).toBe('Alpha blue gamma delta epsilon');
  });
});
