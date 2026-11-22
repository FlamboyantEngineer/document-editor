import { render } from '@testing-library/react';
import { EditorState, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import type { PagedProjection } from '../../pagination/index.js';
import { PagesView } from './pages-view.js';

function stateOf(text: string) {
  const paragraph = documentSchema.nodes.paragraph?.create(null, documentSchema.text(text));
  const content = documentSchema.nodes.doc?.createAndFill(null, paragraph);
  if (!content) throw new Error('The schema has no paragraph.');
  return EditorState.create({ doc: content });
}

const caretAt = (state: EditorState, pos: number) =>
  state.apply(state.tr.setSelection(TextSelection.create(state.doc, pos)));

describe('PagesView', () => {
  it('DOCE-PAGINATION-7.25 keeps a caret the pages sent when React commits an older render of the projection', () => {
    const opened = stateOf('alpha beta gamma');
    // The view sent a caret after "beta ", then one before "alpha", from two keys; React still
    // renders the projection state of the first one when the second has reached the projection.
    const first = caretAt(opened, 12);
    const second = caretAt(first, 1);
    let latest = opened;
    const projection = {
      get projection() {
        return latest;
      },
      receive: () => undefined,
    } as unknown as PagedProjection;
    const views: EditorView[] = [];
    const props = {
      events: { afterCommit: (view: EditorView) => views.push(view) },
      viewProps: {},
      attributes: {},
      drawing: {},
    };
    const { rerender, unmount } = render(
      <PagesView paged={{ projection, state: opened }} {...props} />,
    );
    latest = second;
    rerender(<PagesView paged={{ projection, state: first }} {...props} />);
    const view = views.at(-1);
    expect(view?.state.selection.head).toBe(1);
    unmount();
  });
});
