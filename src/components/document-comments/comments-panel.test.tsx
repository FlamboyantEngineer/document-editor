import { act, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { type Command, TextSelection } from 'prosemirror-state';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Harness, host, PARAGRAPH, seen, text, thread } from '../../../test/comment-fixtures.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { listCommentAnchors, listSuggestions } from '../../engine/index.js';
import { createMemoryHost } from '../../host/index.js';
import type { DocumentEditorHandle } from '../document-editor/editor-handle.js';

installEditorDom();

// A host whose threads mention Ada, written by Grace, one open and one resolved.
const mentioning = () =>
  createMemoryHost({
    person: { id: 'ada', name: 'Ada Lovelace' },
    people: [{ id: 'grace', name: 'Grace Hopper' }],
    comments: {
      threads: {
        doc: [
          {
            ...thread('open', 'open', ''),
            entries: [
              {
                id: 'open-1',
                author: 'grace',
                text: 'Over to @[Ada Lovelace](ada), **please**',
                createdAt: '2026-01-02T03:04:05Z',
              },
            ],
          },
          {
            ...thread('done', 'resolved', ''),
            entries: [
              { id: 'done-1', author: 'grace', text: 'Old', createdAt: '2026-01-02T03:04:05Z' },
            ],
          },
        ],
      },
    },
  });

const panel = () => screen.getByRole('region', { name: 'All comments' });

// Types a word at the end of the document, away from every thread.
const typeAtEnd: Command = (state, dispatch) => {
  dispatch?.(state.tr.insertText(' omega', TextSelection.atEnd(state.doc).head));
  return true;
};

// Puts the caret inside the anchor of a thread.
const caretIn =
  (threadId: string): Command =>
  (state, dispatch) => {
    const anchor = listCommentAnchors(state.doc).find((each) => each.thread === threadId);
    if (!anchor) return false;
    dispatch?.(state.tr.setSelection(TextSelection.create(state.doc, anchor.from + 1)));
    return true;
  };

describe('DocumentCommentsPanel', () => {
  it('DOCE-COMMENTS-4.1 lists suggestions with Accept and Reject in reading order', async () => {
    const user = userEvent.setup();
    render(<Harness host={host()} panel />);
    const list = panel();
    await within(list).findByText('Is blue right?');
    const suggestion = list.querySelector('.de-comments-panel__suggestion');
    if (!(suggestion instanceof HTMLElement)) throw new Error('The suggestion should be listed.');
    expect(within(suggestion).getByText('epsilon')).toBeInTheDocument();
    // The thread on "blue" comes before the suggestion on "epsilon".
    const thread = list.querySelector('.de-comments-panel__thread');
    expect(thread?.compareDocumentPosition(suggestion)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    await user.click(within(suggestion).getByRole('button', { name: 'Accept' }));
    expect(seen.state && listSuggestions(seen.state.doc)).toEqual([]);
    await waitFor(() =>
      expect(list.querySelector('.de-comments-panel__suggestion')).not.toBeInTheDocument(),
    );
  });

  it('DOCE-COMMENTS-4.1 offers no decision to a panel that may not decide', async () => {
    render(<Harness host={host()} panel={{ canDecide: false }} />);
    const list = panel();
    await within(list).findByText('epsilon');
    expect(within(list).queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
  });

  it('DOCE-COMMENTS-4.2 counts each filter and counts mentions of the reader as theirs', async () => {
    const user = userEvent.setup();
    render(<Harness host={mentioning()} panel />);
    const list = panel();
    await within(list).findAllByText('Ada Lovelace');
    // Her suggestion's card names her too, though she wrote no comment on it.
    const suggestion = list.querySelector('.de-comments-panel__suggestion');
    expect(suggestion).toHaveTextContent('Ada Lovelace');
    const filter = within(list).getByRole('radiogroup', { name: 'Show' });
    // Open: the open thread and the suggestion; all: the resolved thread too; mine: the thread
    // that mentions Ada and her own suggestion.
    expect(within(filter).getByRole('radio', { name: /Open.*2/ })).toBeInTheDocument();
    expect(within(filter).getByRole('radio', { name: /All.*3/ })).toBeInTheDocument();
    expect(within(filter).getByRole('radio', { name: /Mine.*2/ })).toBeInTheDocument();
    await user.click(within(filter).getByRole('radio', { name: /Mine/ }));
    expect(within(list).queryByText('Old')).not.toBeInTheDocument();
  });

  it('DOCE-COMMENTS-4.2 hides the threads the reader is not the audience of', async () => {
    render(
      <Harness
        host={host()}
        options={{ audience: (each) => each.id !== 'open' }}
        panel={{ audience: (each) => each.id !== 'open' }}
      />,
    );
    await within(panel()).findByText('epsilon');
    expect(screen.queryByText('Is blue right?')).not.toBeInTheDocument();
  });

  it('DOCE-COMMENTS-4.2 filters the margin to the reader’s own threads', async () => {
    const store = createMemoryHost({
      person: { id: 'ada', name: 'Ada Lovelace' },
      people: [{ id: 'grace', name: 'Grace Hopper' }],
      comments: {
        threads: {
          doc: [{ ...thread('open', 'open', 'Not mine'), entries: [] }],
        },
      },
    });
    render(
      <Harness
        host={store}
        options={{ filter: 'mine' }}
        content={[
          ...PARAGRAPH.slice(0, 5),
          text('zeta', [{ type: 'insertion', attrs: { id: 's2', author: 'grace' } }]),
          text('epsilon', [{ type: 'insertion', attrs: { id: 's1', author: 'ada' } }]),
        ]}
      />,
    );
    const margin = screen.getByRole('list', { name: 'Comments' });
    expect(await within(margin).findByText('epsilon')).toBeInTheDocument();
    expect(within(margin).queryByText('zeta')).not.toBeInTheDocument();
    expect(within(margin).queryByRole('group', { name: 'Comment thread' })).not.toBeInTheDocument();
  });

  it('DOCE-COMMENTS-3.7 draws a card again only when what it shows changes, not as the reader types elsewhere', async () => {
    // The host's actions are asked for each time a comment is drawn, in the margin and the panel.
    const inMargin = vi.fn(() => []);
    const inPanel = vi.fn(() => []);
    const handle = createRef<DocumentEditorHandle>();
    render(
      <Harness
        host={host()}
        handleRef={handle}
        options={{ commentActions: inMargin }}
        panel={{ commentActions: inPanel }}
      />,
    );
    await within(panel()).findByRole('heading', { name: 'Ada Lovelace' });
    await waitFor(() => expect(handle.current).not.toBeNull());
    const drawn = { margin: inMargin.mock.calls.length, panel: inPanel.mock.calls.length };
    act(() => {
      handle.current?.run(typeAtEnd);
    });
    await waitFor(() => expect(seen.state?.doc.textContent).toContain('omega'));
    expect(inPanel).toHaveBeenCalledTimes(drawn.panel);
    expect(inMargin).toHaveBeenCalledTimes(drawn.margin);
    // The card the caret moves into is drawn again, as the active one.
    act(() => {
      handle.current?.run(caretIn('open'));
    });
    const card = within(panel()).getByRole('group', { name: 'Comment thread' });
    await waitFor(() => expect(card).toHaveAttribute('data-selected', 'true'));
    expect(inPanel.mock.calls.length).toBeGreaterThan(drawn.panel);
  });

  it('DOCE-COMMENTS-2.11 lists its cards as a list, and hands keyboard focus on when a card goes', async () => {
    const user = userEvent.setup();
    render(<Harness host={host()} panel options={{ placement: 'pane' }} />);
    const list = within(panel()).getByRole('list');
    await within(list).findByText('Is blue right?');
    // Each card is an item of the list; a thread's comments are a list of their own inside it.
    const thread = list.querySelector<HTMLElement>(':scope > .de-comments-panel__thread');
    const suggestion = list.querySelector<HTMLElement>(':scope > .de-comments-panel__suggestion');
    if (!thread || !suggestion) throw new Error('The thread and the suggestion should be listed.');
    expect(thread).toHaveAttribute('role', 'listitem');
    expect(suggestion).toHaveAttribute('role', 'listitem');
    // The decided suggestion's card goes: the thread's, before it, takes focus.
    await user.click(within(suggestion).getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(thread).toHaveFocus());
    // The resolved thread's card goes too, and the list itself takes focus.
    await user.click(within(thread).getByRole('button', { name: 'Resolve' }));
    await waitFor(() => expect(list).toHaveFocus());
  });

  it('DOCE-COMMENTS-4.6 makes the card the caret is in the active one, as the margin does', async () => {
    const user = userEvent.setup();
    render(<Harness host={host()} panel />);
    const list = panel();
    await within(list).findByText('Is blue right?');
    const [show] = within(list).getAllByRole('button', { name: 'Show in document' });
    if (!show) throw new Error('The thread should offer to show its text.');
    await user.click(show);
    const card = within(list).getByRole('group', { name: 'Comment thread' });
    await waitFor(() => expect(card).toHaveAttribute('data-selected', 'true'));
  });
});
