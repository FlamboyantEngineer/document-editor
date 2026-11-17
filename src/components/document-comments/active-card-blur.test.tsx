import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Harness, host } from '../../../test/comment-fixtures.js';
import { installEditorDom } from '../../../test/editor-dom.js';

installEditorDom();

// The margin's card holding a comment's text.
async function cardOf(text: string) {
  const margin = screen.getByRole('list', { name: 'Comments' });
  const card = (await within(margin).findByText(text)).closest('[role="listitem"]');
  if (!(card instanceof HTMLElement)) throw new Error(`No card for "${text}".`);
  return card;
}

describe('The active card when focus leaves', () => {
  it.each([
    [true, false],
    [false, true],
  ])(
    'DOCE-COMMENTS-2.37 with clearsActiveOnBlur %s, a card left by focus is active: %s',
    async (clears, active) => {
      const user = userEvent.setup();
      render(
        <>
          <Harness host={host()} options={{ clearsActiveOnBlur: clears }} />
          <button type="button">Elsewhere</button>
        </>,
      );
      const card = await cardOf('Is blue right?');
      await user.click(within(card).getByText('Is blue right?'));
      await waitFor(() => expect(card).toHaveAttribute('data-active', 'true'));
      await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
      await waitFor(() =>
        active
          ? expect(card).toHaveAttribute('data-active', 'true')
          : expect(card).not.toHaveAttribute('data-active'),
      );
    },
  );
});
