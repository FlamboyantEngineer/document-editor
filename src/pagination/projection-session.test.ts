import { TextSelection, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it } from 'vitest';
import {
  canonicalState,
  edit,
  mount,
  positionOf,
  stubLayout,
  textOf,
} from '../../test/projection-fixtures.js';
import { createPagedProjection } from './projection.js';

// Counts the times a focused view of the pages scrolls to its selection.
function countScrolls(view: EditorView): () => number {
  let scrolls = 0;
  view.focus();
  view.setProps({
    handleScrollToSelection() {
      scrolls += 1;
      return true;
    },
  });
  return () => scrolls;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('scrolling to the selection on the pages', () => {
  it('DOCE-PAGINATION-7.12 shows a change no transaction asked to scroll for where the pages stand', () => {
    const { projection } = mount();
    const scrolls = countScrolls(projection.view);
    const far = (text: string) => positionOf(projection.state.doc, text);
    // As a collaborator's change comes: a canonical transaction that asks for nothing.
    projection.dispatch(projection.state.tr.insertText('x', far('Epsilon')));
    edit(projection, (state) => state.tr.insertText('y', far('Epsilon')));
    // As the host replaces the state.
    projection.update(projection.state.apply(projection.state.tr.insertText('z', far('Epsilon'))));
    expect(textOf(projection.projection.doc)).toContain('xyzEpsilon');
    expect(scrolls()).toBe(0);
  });

  it('DOCE-PAGINATION-7.12 scrolls to the selection for a canonical transaction that asks to', () => {
    const { projection } = mount();
    const scrolls = countScrolls(projection.view);
    const { doc } = projection.state;
    const caret = TextSelection.create(doc, positionOf(doc, 'Epsilon'));
    // A selection alone, as going to a place in the document makes.
    projection.dispatch(projection.state.tr.setSelection(caret).scrollIntoView());
    expect(scrolls()).toBe(1);
    projection.dispatch(projection.state.tr.insertText('x').scrollIntoView());
    expect(scrolls()).toBe(2);
    edit(projection, (state) => state.tr.insertText('y').scrollIntoView());
    expect(scrolls()).toBe(3);
  });
});

describe('starting the projection', () => {
  it('DOCE-PAGINATION-7.10 dispatches nothing as it starts, and keeps the canonical selection', () => {
    stubLayout({});
    const start = canonicalState();
    const at = positionOf(start.doc, 'Delta');
    const state = start.apply(start.tr.setSelection(TextSelection.create(start.doc, at)));
    const dispatched: Transaction[] = [];
    const projection = createPagedProjection({
      measureIn: document.body.appendChild(document.createElement('div')),
      state,
      pageHeight: 1000,
      settle: 0,
      schedule: () => () => undefined,
      dispatch: (tr) => dispatched.push(tr),
      onProjection: () => undefined,
    });
    expect(dispatched).toHaveLength(0);
    expect(projection.state.selection.head).toBe(at);
    const { map } = projection;
    expect(map.toCanonical(projection.projection.selection.head)).toBe(at);
    projection.destroy();
  });
});
