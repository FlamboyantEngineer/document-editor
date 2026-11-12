import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Harness, host, PARAGRAPH, seen, text, thread } from '../../../test/comment-fixtures.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { listSuggestions } from '../../engine/index.js';
import { createMemoryHost } from '../../host/index.js';

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
    await within(list).findByText('Ada Lovelace');
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
