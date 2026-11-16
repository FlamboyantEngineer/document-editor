import { type Command, EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { parseMarkup } from '../../test/document-markup.js';
import { moveToBodyEdge } from './body-edge.js';

// A document opening and ending with an object that holds no caret.
const doc = parseMarkup('<hr><p>One</p><p>Two</p><hr>');

function run(state: EditorState, command: Command) {
  let next = state;
  expect(command(state, (tr) => (next = state.apply(tr)))).toBe(true);
  return next;
}

describe('body edge keys', () => {
  it('DOCE-PAGINATION-7.21 puts the caret at the first and last text, past objects', () => {
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 6) });
    const start = run(state, moveToBodyEdge(-1, false)).selection;
    expect(start.empty).toBe(true);
    const first = doc.resolve(start.head).parent.textContent;
    expect(first).toBe('One');
    expect(start.head).toBe(doc.resolve(start.head).start());
    const end = run(state, moveToBodyEdge(1, false)).selection;
    const last = doc.resolve(end.head).parent.textContent;
    expect(last).toBe('Two');
    expect(end.head).toBe(doc.resolve(end.head).end());
  });

  it('DOCE-PAGINATION-7.21 extends the selection to the first and last text with Shift', () => {
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 3) });
    const back = run(state, moveToBodyEdge(-1, true)).selection;
    expect([back.anchor, back.head]).toEqual([3, 2]);
    const forward = run(state, moveToBodyEdge(1, true)).selection;
    expect(forward.anchor).toBe(3);
    expect(doc.textBetween(forward.from, forward.to)).toBe('neTwo');
  });
});
