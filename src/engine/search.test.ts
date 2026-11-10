import { type Command, EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import { createEditLock } from './edit-lock.js';
import {
  createSearch,
  replaceAllMatches,
  replaceMatch,
  searchKey,
  selectNextMatch,
  selectPreviousMatch,
  setSearch,
} from './search.js';

const paragraph = (value: string): StoredNode => ({
  type: 'paragraph',
  content: [{ type: 'text', text: value }],
});

function stateOf(...values: string[]) {
  const doc = readDocumentFile(
    { formatVersion: 1, sections: [{ name: null, content: values.map(paragraph) }] },
    documentSchema,
  );
  return EditorState.create({ doc, plugins: [createSearch()] });
}

function run(state: EditorState, command: Command): EditorState {
  let next = state;
  expect(command(state, (tr) => (next = next.apply(tr)))).toBe(true);
  return next;
}

const textOf = (state: EditorState) => state.doc.textBetween(0, state.doc.content.size, '|');
const selected = (state: EditorState) =>
  state.doc.textBetween(state.selection.from, state.selection.to);

describe('search', () => {
  it('DOCE-SEARCH-1.1 finds a query in every text block, by case and whole words', () => {
    let state = run(stateOf('The log, the Logger.', 'A log entry'), setSearch('log'));
    expect(searchKey.getState(state)?.matches).toHaveLength(3);
    state = run(state, setSearch('log', { caseSensitive: true }));
    expect(searchKey.getState(state)?.matches).toHaveLength(2);
    state = run(state, setSearch('log', { wholeWord: true }));
    expect(searchKey.getState(state)?.matches).toHaveLength(2);
    state = run(state, setSearch(''));
    expect(searchKey.getState(state)?.matches).toEqual([]);
  });

  it('DOCE-SEARCH-1.2 moves between matches, wrapping around', () => {
    let state = run(stateOf('one two one two one'), setSearch('one'));
    state = run(state, selectNextMatch);
    expect(searchKey.getState(state)?.current).toBe(1);
    expect(selected(state)).toBe('one');
    state = run(state, selectPreviousMatch);
    state = run(state, selectPreviousMatch);
    expect(searchKey.getState(state)?.current).toBe(2);
  });

  it('DOCE-SEARCH-1.3 replaces the current match or all of them', () => {
    let state = run(stateOf('cat and cat', 'cat'), setSearch('cat'));
    state = run(state, replaceMatch('dog'));
    expect(textOf(state)).toBe('dog and cat|cat');
    expect(searchKey.getState(state)?.matches).toHaveLength(2);
    state = run(state, replaceAllMatches('cow'));
    expect(textOf(state)).toBe('dog and cow|cow');
    expect(searchKey.getState(state)?.matches).toEqual([]);
  });

  it('DOCE-SEARCH-1.4 leaves matches in locked content found and unchanged', () => {
    const doc = stateOf('cat here', 'Fixed cat').doc;
    let state = EditorState.create({
      doc,
      plugins: [
        createSearch(),
        createEditLock({
          isLocked: (node, pos) => node.resolve(pos).parent.textContent.startsWith('Fixed'),
        }),
      ],
    });
    state = run(state, setSearch('cat'));
    state = run(state, replaceAllMatches('dog'));
    expect(textOf(state)).toBe('dog here|Fixed cat');
    expect(searchKey.getState(state)?.matches).toHaveLength(1);
    expect(replaceAllMatches('dog')(state)).toBe(false);
  });
});
