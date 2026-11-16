import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Harness, host, thread } from '../../../test/comment-fixtures.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { type CommentThread, createMemoryHost } from '../../host/index.js';
import type { ThreadActionTarget } from './comment-cards.js';

installEditorDom();

const margin = () => screen.getByRole('list', { name: 'Comments' });

// The open thread's card, once its comment shows.
async function openCard() {
  const card = (await within(margin()).findByText('Is blue right?')).closest('[role="group"]');
  if (!(card instanceof HTMLElement)) throw new Error('The open thread should show.');
  return card;
}

// The host's link entry in every thread's and suggestion's header menu.
const linkTo = vi.fn((target: ThreadActionTarget) => [
  { id: 'link', label: `Link to ${target.thread?.id ?? target.suggestion ?? ''}` },
]);

// A host whose resolved thread decided a suggestion that the document no longer has.
function decidedHost(decision: 'accept' | 'reject') {
  const decided: CommentThread = {
    ...thread('done', 'resolved', 'Old'),
    suggestion: 'gone',
    decision: { decision, suggestion: 'gone', by: 'ada', at: '2026-01-02T03:05:00Z' },
  };
  return createMemoryHost({
    person: { id: 'ada', name: 'Ada Lovelace' },
    comments: { threads: { doc: [thread('open', 'open', 'Is blue right?'), decided] } },
  });
}

describe('Comment card headers', () => {
  it('DOCE-COMMENTS-2.33 resolves from an icon, and moves the opening comment’s Edit and Delete into the header menu', async () => {
    const user = userEvent.setup();
    render(<Harness host={host()} options={{ threadActions: linkTo }} />);
    const card = await openCard();
    const comment = within(card).getByText('Is blue right?').closest('article');
    if (!(comment instanceof HTMLElement)) throw new Error('The comment should show.');
    // The comment draws no menu of its own.
    expect(
      within(comment).queryByRole('button', { name: /actions|more/i }),
    ).not.toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Resolve' })).not.toHaveTextContent('Resolve');
    await user.click(within(card).getByRole('button', { name: 'More actions' }));
    const items = (await screen.findAllByRole('menuitem')).map((item) => item.textContent);
    expect(items).toEqual(['Edit', 'Delete', 'Link to open']);
  });

  it('DOCE-COMMENTS-2.33 keeps the header menu for a reader who may not comment, and Reopen in it', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <Harness
        host={host()}
        canComment={false}
        options={{ threadActions: linkTo, filter: 'all' }}
      />,
    );
    const card = await openCard();
    await user.click(within(card).getByRole('button', { name: 'More actions' }));
    expect(await screen.findByRole('menuitem', { name: 'Link to open' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    unmount();
    // A resolved thread offers Reopen in the menu, not as a button.
    render(<Harness host={host()} options={{ filter: 'all' }} />);
    const resolved = (await within(margin()).findByText('Old')).closest('[role="group"]');
    if (!(resolved instanceof HTMLElement)) throw new Error('The resolved thread should show.');
    expect(within(resolved).queryByRole('button', { name: 'Reopen' })).not.toBeInTheDocument();
    await user.click(within(resolved).getByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Reopen' }));
    await waitFor(() =>
      expect(within(resolved).getByRole('button', { name: 'Resolve' })).toBeInTheDocument(),
    );
  });

  it('DOCE-COMMENTS-2.33 closes a thread being started from its header', async () => {
    const user = userEvent.setup();
    render(<Harness host={host()} select="gamma" />);
    await user.click(await screen.findByRole('button', { name: 'Comment' }));
    const box = screen.getByRole('textbox', { name: 'Add a comment' });
    const card = box.closest('[role="group"]');
    if (!(card instanceof HTMLElement)) throw new Error('The thread being started should show.');
    await user.click(within(card).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('textbox', { name: 'Add a comment' })).not.toBeInTheDocument();
  });

  it('DOCE-COMMENTS-2.33 deletes without asking when the host turns the confirmation off', async () => {
    const user = userEvent.setup();
    const store = host();
    render(<Harness host={store} options={{ confirmsDelete: false }} />);
    const card = await openCard();
    await user.click(within(card).getByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(within(margin()).queryByText('Is blue right?')).not.toBeInTheDocument(),
    );
  });

  it('DOCE-COMMENTS-2.34 shows the reply box on the selected card only, with the host’s words', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        host={host()}
        select="gamma"
        options={{ labels: { replyPlaceholder: 'Reply or mention', submitComment: 'Create' } }}
      />,
    );
    const card = await openCard();
    expect(within(card).queryByRole('textbox', { name: 'Reply' })).not.toBeInTheDocument();
    await user.click(within(card).getByText('Is blue right?'));
    const box = within(card).getByRole('textbox', { name: 'Reply' });
    expect(box).toHaveAttribute('aria-placeholder', 'Reply or mention');
    // A new thread's button says what the host asks, the offer keeping its own word.
    await user.click(screen.getByRole('button', { name: 'Comment' }));
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
  });

  it('DOCE-COMMENTS-2.34 selects a card of the panel the reader presses', async () => {
    const user = userEvent.setup();
    render(<Harness host={host()} panel />);
    const panel = screen.getByRole('region', { name: 'All comments' });
    await within(panel).findByText('Is blue right?');
    const card = within(panel).getByRole('group', { name: 'Comment thread' });
    expect(card).not.toHaveAttribute('data-selected', 'true');
    await user.click(within(card).getByText('Is blue right?'));
    expect(card).toHaveAttribute('data-selected', 'true');
    expect(within(card).getByRole('textbox', { name: 'Reply' })).toHaveFocus();
  });

  it.each([
    ['accept', 'Accepted'],
    ['reject', 'Rejected'],
  ] as const)(
    'DOCE-COMMENTS-2.35 says a decided suggestion’s thread was %sed, and offers no Reopen',
    async (decision, said) => {
      const user = userEvent.setup();
      render(<Harness host={decidedHost(decision)} panel={{ filter: 'all' }} />);
      const panel = screen.getByRole('region', { name: 'All comments' });
      const card = (await within(panel).findByText('Old')).closest('[role="group"]');
      if (!(card instanceof HTMLElement)) throw new Error('The decided thread should show.');
      const badge = within(card).getByText(said).closest('.de-document-comments__decision');
      expect(badge).toHaveAttribute('data-decision', decision);
      await user.click(within(card).getByRole('button', { name: 'More actions' }));
      expect(screen.queryByRole('menuitem', { name: 'Reopen' })).not.toBeInTheDocument();
    },
  );

  it('DOCE-COMMENTS-2.4 opens a suggestion’s card with its writer, icon decisions and the header menu', async () => {
    const user = userEvent.setup();
    render(<Harness host={host()} options={{ threadActions: linkTo }} />);
    const card = await within(margin()).findByRole('group', { name: 'Suggestion' });
    expect(within(card).getByText('Ada Lovelace')).toBeInTheDocument();
    expect(within(card).getByText('Add')).toBeInTheDocument();
    const decide = within(card).getByRole('group', { name: 'Decide' });
    expect(within(decide).getByRole('button', { name: 'Accept' })).not.toHaveTextContent('Accept');
    await user.click(within(card).getByRole('button', { name: 'More actions' }));
    // The suggestion has no thread yet; the host's entry is for the suggestion.
    expect(await screen.findByRole('menuitem', { name: 'Link to s1' })).toBeInTheDocument();
  });

  it('DOCE-COMMENTS-2.4 reacts to a suggestion’s thread as a whole, from its opening post', async () => {
    const user = userEvent.setup();
    const store = createMemoryHost({
      person: { id: 'ada', name: 'Ada Lovelace' },
      comments: {
        threads: {
          doc: [
            {
              ...thread('about', 'open', ''),
              suggestion: 's1',
              entries: [],
              reactions: { '👍': ['grace'] },
            },
          ],
        },
      },
    });
    render(
      <Harness
        host={store}
        content={[
          { type: 'text', text: 'Alpha ' },
          {
            type: 'text',
            text: 'epsilon',
            marks: [{ type: 'insertion', attrs: { id: 's1', author: 'ada', thread: 'about' } }],
          },
        ]}
      />,
    );
    const card = await within(margin()).findByRole('group', { name: 'Suggestion' });
    const reactions = await within(card).findByRole('group', { name: 'Reactions' });
    await user.click(within(reactions).getByRole('button', { name: /👍/ }));
    await waitFor(async () => {
      const listed = await store.comments?.list('doc');
      expect(listed?.ok && listed.value[0]?.reactions).toEqual({ '👍': ['grace', 'ada'] });
    });
  });
});
