import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { parseMarkup } from '../../test/document-markup.js';
import { createListStarts } from './list-starts.js';

const starts = (view: EditorView) =>
  [...view.dom.querySelectorAll('ol')].map((list) =>
    list.style.getPropertyValue('--de-list-start'),
  );

describe('list starts', () => {
  it('DOCE-PAGINATION-4.1 tells how many items come before an ordered list that starts past 1', () => {
    const doc = parseMarkup(
      '<ol><li><p>One</p></li></ol><ol start="40"><li><p>Forty</p></li></ol>',
    );
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({ doc, plugins: [createListStarts()] }),
    });
    expect(starts(view)).toEqual(['', '39']);
    // Typing keeps it.
    view.dispatch(view.state.tr.insertText('Item ', 3));
    expect(starts(view)).toEqual(['', '39']);
    view.destroy();
  });
});
