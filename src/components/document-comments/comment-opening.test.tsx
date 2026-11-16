import { act, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { Harness, host, seen } from '../../../test/comment-fixtures.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { commentDraft } from '../../engine/index.js';
import type { DocumentEditorHandle } from '../document-editor/editor-handle.js';

installEditorDom();

const margin = () => screen.getByRole('list', { name: 'Comments' });
const markers = { presentation: 'markers' } as const;
// The document's own element holding some text.
const textElement = (wanted: string) => {
  const found = screen
    .getByRole('textbox', { name: 'Report' })
    .querySelectorAll<HTMLElement>('mark, ins, del, p');
  const element = [...found].find((each) => each.textContent === wanted);
  if (!element) throw new Error(`No element holds ${wanted}`);
  return element;
};

describe('Opening comment cards', () => {
  it('DOCE-COMMENTS-2.23 shows markers by default and opens no card at load', async () => {
    const store = host();
    render(<Harness host={store} options={{ presentation: undefined }} />);
    const list = margin();
    // A marker for the open thread and one for the suggestion, and no card yet.
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(2));
    expect(within(list).queryByText('Is blue right?')).not.toBeInTheDocument();
    const [first] = within(list).getAllByRole('button', { expanded: false });
    await userEvent.setup().click(first as HTMLElement);
    expect(await within(list).findByText('Is blue right?')).toBeInTheDocument();
  });

  it('DOCE-COMMENTS-2.23 opens a card from its text, focusing it, then its reply box', async () => {
    const user = userEvent.setup();
    render(<Harness host={host()} options={markers} />);
    await waitFor(() => expect(within(margin()).getAllByRole('listitem')).toHaveLength(2));
    await user.click(textElement('blue'));
    const thread = await within(margin()).findByRole('group', { name: 'Comment thread' });
    const card = thread.closest<HTMLElement>('.de-document-comments__card');
    await waitFor(() => expect(card).toHaveFocus());
    // Once open, a click on its text focuses its reply box.
    await user.click(textElement('blue'));
    await waitFor(() =>
      expect(within(thread).getByRole('textbox', { name: 'Reply' })).toHaveFocus(),
    );
  });

  it('DOCE-COMMENTS-2.23 opens a suggestion’s card from its text', async () => {
    const user = userEvent.setup();
    render(<Harness host={host()} options={markers} />);
    await waitFor(() => expect(within(margin()).getAllByRole('listitem')).toHaveLength(2));
    await user.click(textElement('epsilon'));
    expect(await within(margin()).findByRole('button', { name: 'Accept' })).toBeInTheDocument();
  });

  it('DOCE-COMMENTS-2.23 DOCE-COMMENTS-2.9 opens and focuses the card of a thread the handle opens', async () => {
    const handle = createRef<DocumentEditorHandle>();
    render(<Harness host={host()} options={markers} handleRef={handle} />);
    await waitFor(() => expect(within(margin()).getAllByRole('listitem')).toHaveLength(2));
    act(() => {
      expect(handle.current?.openThread('open')).toBe(true);
    });
    const thread = await within(margin()).findByRole('group', { name: 'Comment thread' });
    await waitFor(() => expect(thread.closest('.de-document-comments__card')).toHaveFocus());
  });

  it('DOCE-COMMENTS-2.23 starts a thread from the offer’s marker at once', async () => {
    const user = userEvent.setup();
    render(<Harness host={host()} select="gamma" options={markers} />);
    await waitFor(() => expect(within(margin()).getAllByRole('listitem')).toHaveLength(3));
    const offer = within(margin()).getAllByRole('button', { expanded: false })[1];
    await user.click(offer as HTMLElement);
    expect(
      await within(margin()).findByRole('textbox', { name: 'Add a comment' }),
    ).toBeInTheDocument();
    expect(seen.state && commentDraft(seen.state)).toMatchObject({ from: expect.any(Number) });
  });

  it('DOCE-COMMENTS-2.24 puts a thread being started away on a primary click in the page alone', async () => {
    const user = userEvent.setup();
    const handle = createRef<DocumentEditorHandle>();
    render(<Harness host={host()} select="gamma" handleRef={handle} />);
    act(() => {
      handle.current?.startComment();
    });
    const composer = await within(margin()).findByRole('textbox', { name: 'Add a comment' });
    // Touch, a secondary button and presses in the composer keep the draft.
    await user.pointer({ keys: '[TouchA]', target: textElement('blue') });
    await user.pointer({ keys: '[MouseRight]', target: textElement('blue') });
    await user.click(composer);
    expect(seen.state && commentDraft(seen.state)).not.toBeNull();
    await user.pointer({ keys: '[MouseLeft>]', target: textElement('blue') });
    await waitFor(() => expect(seen.state && commentDraft(seen.state)).toBeNull());
  });

  it('DOCE-COMMENTS-2.2 offers Comment on text exactly another thread’s', async () => {
    render(<Harness host={host()} select="blue" />);
    expect(await within(margin()).findByRole('button', { name: 'Comment' })).toBeInTheDocument();
  });

  it('DOCE-COMMENTS-2.25 focuses a thread’s reply box when its card itself is pressed', async () => {
    const user = userEvent.setup();
    render(<Harness host={host()} />);
    const thread = await within(margin()).findByRole('group', { name: 'Comment thread' });
    await user.click(within(thread).getByText('Is blue right?'));
    expect(within(thread).getByRole('textbox', { name: 'Reply' })).toHaveFocus();
  });
});
