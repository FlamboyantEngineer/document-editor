import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Harness, host, seen } from '../../../test/comment-fixtures.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { commentAnchors } from '../../engine/index.js';

installEditorDom();

const margin = () => screen.getByRole('list', { name: 'Comments' });
const panel = () => screen.getByRole('region', { name: 'All comments' });
const rows = () => within(panel()).getByRole('list', { name: 'In the document' });
const markers = { presentation: 'markers' } as const;

describe('Rows of the comments panel', () => {
  it('DOCE-COMMENTS-4.13 lists the open thread and the suggestion as one row each, under In the document', async () => {
    render(<Harness host={host()} panel={{ anchoredAs: undefined }} />);
    const list = await within(panel()).findByRole('list', { name: 'In the document' });
    const items = within(list).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Comment by Ada Lovelaceon “blue”',
      'Suggestion by Ada Lovelaceon “epsilon”',
    ]);
    expect(items.map((item) => item.dataset.annotation)).toEqual(['thread', 'suggestion']);
    // No second card of the thread, and no empty state while rows are listed.
    expect(within(panel()).queryByText('Is blue right?')).not.toBeInTheDocument();
    expect(within(panel()).queryByRole('group', { name: 'Suggestion' })).not.toBeInTheDocument();
    expect(within(panel()).queryByText('No comments.')).not.toBeInTheDocument();
  });

  it('DOCE-COMMENTS-4.13 keeps a full card for a resolved thread, which the margin does not show', async () => {
    render(<Harness host={host()} panel={{ anchoredAs: undefined, filter: 'all' }} />);
    const resolved = (await within(panel()).findByText('Old')).closest('[role="group"]');
    expect(resolved).toHaveAccessibleName('Comment thread');
    expect(within(rows()).getAllByRole('listitem')).toHaveLength(2);
  });

  it('DOCE-COMMENTS-4.13 opens a row’s card in the margin, focused, with the caret at its text', async () => {
    const user = userEvent.setup();
    render(<Harness host={host()} options={markers} panel={{ anchoredAs: undefined }} />);
    await waitFor(() => expect(within(margin()).getAllByRole('listitem')).toHaveLength(2));
    expect(within(margin()).queryByText('Is blue right?')).not.toBeInTheDocument();
    await user.click(within(rows()).getByRole('button', { name: /Comment by/ }));
    const thread = await within(margin()).findByRole('group', { name: 'Comment thread' });
    await waitFor(() => expect(thread.closest('.de-document-comments__card')).toHaveFocus());
    const anchor = seen.state && commentAnchors(seen.state).find((each) => each.thread === 'open');
    expect(seen.state?.selection.from).toBe(anchor?.from);
    expect(within(rows()).getByRole('button', { name: /Comment by/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
    // A suggestion's row opens the suggestion's card.
    await user.click(within(rows()).getByRole('button', { name: /Suggestion by/ }));
    const suggestion = await within(margin()).findByRole('group', { name: 'Suggestion' });
    await waitFor(() => expect(suggestion.closest('.de-document-comments__card')).toHaveFocus());
  });

  it('DOCE-COMMENTS-4.13 lists full cards when the threads are placed in the pane, or the host asks', async () => {
    const { unmount } = render(
      <Harness
        host={host()}
        options={{ placement: 'pane' }}
        panel={{ anchoredAs: undefined, placement: 'pane' }}
      />,
    );
    expect(await within(panel()).findByText('Is blue right?')).toBeInTheDocument();
    expect(
      within(panel()).queryByRole('list', { name: 'In the document' }),
    ).not.toBeInTheDocument();
    unmount();
    render(<Harness host={host()} panel={{ anchoredAs: 'cards' }} />);
    expect(await within(panel()).findByText('Is blue right?')).toBeInTheDocument();
  });

  it('DOCE-COMMENTS-4.13 names the rows with the host’s words', async () => {
    render(
      <Harness
        host={host()}
        panel={{
          anchoredAs: undefined,
          labels: {
            inDocument: 'On the page',
            threadRow: (name) => `${name} commented`,
            suggestionRow: (name) => `${name} suggested`,
            onText: (text) => `about ${text}`,
          },
        }}
      />,
    );
    const list = await within(panel()).findByRole('list', { name: 'On the page' });
    expect(within(list).getByRole('button', { name: /Ada Lovelace commented/ })).toHaveTextContent(
      'about blue',
    );
    expect(within(list).getByText('Ada Lovelace suggested')).toBeInTheDocument();
  });
});
