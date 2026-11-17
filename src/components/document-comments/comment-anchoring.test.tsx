import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Harness, host, seen } from '../../../test/comment-fixtures.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { listCommentAnchors } from '../../engine/index.js';

installEditorDom();

describe('Anchoring a new thread', () => {
  it('DOCE-COMMENTS-2.2 keeps a word’s trailing space in the thread’s text and in the store', async () => {
    const user = userEvent.setup();
    const store = host();
    render(<Harness host={store} select="gamma " />);
    await user.click(await screen.findByRole('button', { name: 'Comment' }));
    await user.type(screen.getByRole('textbox', { name: 'Add a comment' }), 'Spaced');
    await user.click(screen.getByRole('button', { name: 'Comment' }));
    await waitFor(async () => {
      const listed = await store.comments?.list('doc');
      const started = listed?.ok
        ? listed.value.find((each) => each.quote.startsWith('gamma'))
        : null;
      expect(started?.quote).toBe('gamma ');
      expect(started?.target?.ranges).toMatchObject([{ text: 'gamma ' }]);
    });
    const anchor =
      seen.state &&
      listCommentAnchors(seen.state.doc).find((each) => each.text.startsWith('gamma'));
    expect(anchor?.text).toBe('gamma ');
  });
});
