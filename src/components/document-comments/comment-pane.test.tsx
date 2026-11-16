import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Harness, host, seen } from '../../../test/comment-fixtures.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { commentAnchors } from '../../engine/index.js';

installEditorDom();

const panel = () => screen.getByRole('region', { name: 'All comments' });

describe('Comments pane', () => {
  it('DOCE-COMMENTS-4.12 starts a thread on the whole document from the panel, listed first', async () => {
    const user = userEvent.setup();
    const store = host();
    render(<Harness host={store} panel />);
    await within(panel()).findByText('Is blue right?');
    await user.click(within(panel()).getByRole('button', { name: 'Comment on the document' }));
    const box = within(panel()).getByRole('textbox', { name: 'Add a comment' });
    await waitFor(() => expect(box).toHaveFocus());
    await user.keyboard('About the whole report');
    await user.click(within(panel()).getByRole('button', { name: 'Comment' }));
    const added = await within(panel()).findByText('About the whole report');
    expect(
      within(panel()).queryByRole('textbox', { name: 'Add a comment' }),
    ).not.toBeInTheDocument();
    const listed = await store.comments?.list('doc');
    const thread = listed?.ok ? listed.value.find((each) => each.scope === 'document') : undefined;
    expect(thread).toMatchObject({ quote: '', state: 'open' });
    // It comes before the threads on the document's text, and anchors nothing.
    const [first] = within(panel()).getAllByRole('group', { name: 'Comment thread' });
    expect(first).toContainElement(added);
    expect(seen.state && commentAnchors(seen.state).map((each) => each.thread)).not.toContain(
      thread?.id,
    );
  });

  it('DOCE-COMMENTS-4.12 closes the thread being started, and offers none to a reader who may not comment', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Harness host={host()} panel />);
    await within(panel()).findByText('Is blue right?');
    await user.click(within(panel()).getByRole('button', { name: 'Comment on the document' }));
    await user.click(within(panel()).getByRole('button', { name: 'Close' }));
    expect(
      within(panel()).queryByRole('textbox', { name: 'Add a comment' }),
    ).not.toBeInTheDocument();
    unmount();
    render(<Harness host={host()} panel={{ canComment: false }} />);
    await within(panel()).findByText('Is blue right?');
    expect(
      within(panel()).queryByRole('button', { name: 'Comment on the document' }),
    ).not.toBeInTheDocument();
  });

  it('DOCE-COMMENTS-2.25 shows a card’s text when it is pressed, keeping focus in the panel', async () => {
    const user = userEvent.setup();
    render(<Harness host={host()} panel />);
    const card = (await within(panel()).findByText('Is blue right?')).closest('[role="group"]');
    if (!(card instanceof HTMLElement)) throw new Error('The thread should show.');
    await user.click(within(card).getByText('Is blue right?'));
    const anchor = seen.state && commentAnchors(seen.state).find((each) => each.thread === 'open');
    await waitFor(() => expect(seen.state?.selection.from).toBe(anchor?.from));
    expect(within(card).getByRole('textbox', { name: 'Reply' })).toHaveFocus();
  });
});
