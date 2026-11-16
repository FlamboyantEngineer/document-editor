import { type Command, EditorState, NodeSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { parseMarkup } from '../../test/document-markup.js';
import { fillEmptyContent } from './page-caret.js';

const doc = parseMarkup('<p>One</p>');

function run(state: EditorState, command: Command) {
  let next = state;
  expect(command(state, (tr) => (next = state.apply(tr)))).toBe(true);
  return next;
}

describe('page caret', () => {
  it('DOCE-PAGINATION-7.21 puts an empty paragraph where content may start, and nowhere else', () => {
    const empty = parseMarkup('<hr>');
    const state = EditorState.create({ doc: empty, selection: NodeSelection.create(empty, 0) });
    const filled = run(state, fillEmptyContent(empty.content.size));
    expect(filled.doc.lastChild?.type.name).toBe('paragraph');
    expect(filled.selection.$head.parent.type.name).toBe('paragraph');
    expect(fillEmptyContent(null)(state)).toBe(false);
    const inText = EditorState.create({ doc });
    expect(fillEmptyContent(2)(inText)).toBe(false);
  });
});
