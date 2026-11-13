import { Node } from 'prosemirror-model';
import { type Command, EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { BASE_TEMPLATE, readDocumentFile, type StoredNode } from '../model/index.js';
import { createDocumentEditing } from './document-editing.js';
import { createEditLock } from './edit-lock.js';
import {
  createSearch,
  replaceAllMatches,
  replaceMatch,
  revealMatchAt,
  SEARCH_MATCH_ATTR,
  SEARCH_RESULT_ATTR,
  searchKey,
  searchPaneKey,
  searchSeed,
  searchState,
  selectNextMatch,
  selectPreviousMatch,
  setSearch,
} from './search.js';
import { searchResults } from './search-results.js';

const paragraph = (value: string): StoredNode => ({
  type: 'paragraph',
  content: [{ type: 'text', text: value }],
});

function stateOf(...values: string[]) {
  const doc = readDocumentFile(
    { formatVersion: 1, sections: [{ name: null, content: values.map(paragraph) }] },
    documentSchema,
  ).doc;
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

  it('DOCE-SEARCH-1.1 follows typed text by searching again only the blocks it changed', () => {
    let state = run(stateOf('log one', 'two', 'log three', 'log four'), setSearch('log'));
    state = run(state, selectNextMatch);
    let typedAt = -1;
    state.doc.descendants((node, pos) => {
      if (node.isText && node.text === 'two') typedAt = pos + 3;
    });
    const descendants = vi.spyOn(Node.prototype, 'descendants');
    const typed = state.apply(state.tr.insertText('lo', typedAt).insertText('g', typedAt + 2));
    const walked = descendants.mock.contexts.filter(
      (node) => (node as Node).type.name === 'doc',
    ).length;
    descendants.mockRestore();
    expect(walked).toBe(0);
    const fresh = run(
      EditorState.create({ doc: typed.doc, plugins: [createSearch()] }),
      setSearch('log'),
    );
    const found = searchState(typed);
    expect(found?.matches).toEqual(searchState(fresh)?.matches);
    expect(found?.matches).toHaveLength(4);
    const marks = (each: EditorState) =>
      (searchKey.getState(each)?.decorations.find() ?? []).map((decoration) => [
        decoration.from,
        decoration.to,
        (decoration as unknown as { type: { attrs: Record<string, string> } }).type.attrs[
          SEARCH_MATCH_ATTR
        ],
      ]);
    expect(marks(typed).map(([from, to]) => [from, to])).toEqual(
      found?.matches.map((match) => [match.from, match.to]),
    );
    expect(marks(typed).filter(([, , kind]) => kind === 'current')).toHaveLength(1);
    expect(marks(typed)[found?.current ?? -1]?.[2]).toBe('current');
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

  it('DOCE-SEARCH-1.3 goes on to the match after a replacement that holds the query', () => {
    let state = run(stateOf('a cat and a cat'), setSearch('cat'));
    state = run(state, replaceMatch('cats'));
    expect(searchKey.getState(state)?.current).toBe(1);
    state = run(state, replaceMatch('cats'));
    expect(textOf(state)).toBe('a cats and a cats');
  });

  it('DOCE-SEARCH-1.3 goes on to the match after a replacement, not back to the one before it', () => {
    let state = run(stateOf('ababab'), setSearch('ab'));
    state = run(state, selectNextMatch);
    state = run(state, replaceMatch('X'));
    expect(textOf(state)).toBe('abXab');
    expect(searchKey.getState(state)?.current).toBe(1);
    state = run(state, replaceMatch('X'));
    expect(textOf(state)).toBe('abXX');
    // After the last match the search wraps to the first.
    expect(searchKey.getState(state)?.current).toBe(0);
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

  it('DOCE-SEARCH-1.4 leaves a match in an embed found and replaces the others', () => {
    const embed: StoredNode = {
      type: 'embed',
      attrs: { id: 'e0000001', kind: 'data-set', source: 'set-7', snapshot: 'r1', label: 'Set 7' },
      content: [paragraph('pump total 42')],
    };
    const doc = readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          {
            name: null,
            content: [paragraph('The pump starts.'), embed, paragraph('A pump stops.')],
          },
        ],
      },
      documentSchema,
    ).doc;
    let state = EditorState.create({
      doc,
      plugins: [...createDocumentEditing(documentSchema), createSearch()],
    });
    state = run(state, setSearch('pump'));
    expect(searchResults(state).map((result) => result.replaceable)).toEqual([true, false, true]);
    // Applied as a view does, so the embed's own lock would drop a change reaching into it whole.
    expect(
      replaceAllMatches('motor')(state, (tr) => (state = state.applyTransaction(tr).state)),
    ).toBe(true);
    expect(textOf(state)).toBe('The motor starts.|pump total 42|A motor stops.');
    expect(replaceMatch('motor')(state)).toBe(false);
  });

  it('DOCE-SEARCH-3.1 gives each match in the text of its block, under its heading', () => {
    const doc = readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          {
            name: null,
            content: [
              paragraph('A log before any heading.'),
              { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Power' }] },
              paragraph('The log keeps each log.'),
            ],
          },
        ],
      },
      documentSchema,
    ).doc;
    let state = EditorState.create({ doc, plugins: [createSearch()] });
    state = run(state, setSearch('log'));
    expect(searchResults(state, { template: BASE_TEMPLATE })).toEqual([
      {
        index: 0,
        source: 'A log before any heading.',
        start: 2,
        end: 5,
        heading: null,
        replaceable: true,
      },
      {
        index: 1,
        source: 'The log keeps each log.',
        start: 4,
        end: 7,
        heading: '1. Power',
        replaceable: true,
      },
      {
        index: 2,
        source: 'The log keeps each log.',
        start: 19,
        end: 22,
        heading: '1. Power',
        replaceable: true,
      },
    ]);
  });

  it('DOCE-SEARCH-3.1 reveals a match without moving the selection', () => {
    let state = run(stateOf('one two one two one'), setSearch('one'));
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 5)));
    state = run(state, revealMatchAt(2));
    expect(searchKey.getState(state)?.current).toBe(2);
    expect(state.selection.from).toBe(5);
    expect(state.selection.empty).toBe(true);
    expect(revealMatchAt(5)(state)).toBe(false);
  });
});

// A paragraph holding a mention of a person, a template variable showing a value, and text.
const withInlineNodes = (): StoredNode => ({
  type: 'paragraph',
  content: [
    { type: 'text', text: 'Ask ' },
    { type: 'mention', attrs: { person: 'u-1', label: 'Ana' } },
    { type: 'text', text: ' about ' },
    {
      type: 'variable',
      attrs: { key: 'model' },
      content: [{ type: 'text', text: 'Pump 7' }],
    },
    { type: 'text', text: ' and pump care.' },
  ],
});

// Where the first text block's text starts.
function firstTextAt(state: EditorState): number {
  let at = -1;
  state.doc.descendants((node, pos) => {
    if (at < 0 && node.isTextblock) at = pos + 1;
    return at < 0;
  });
  return at;
}

function stateWith(content: StoredNode[]) {
  const doc = readDocumentFile(
    { formatVersion: 1, sections: [{ name: null, content }] },
    documentSchema,
  ).doc;
  return EditorState.create({ doc, plugins: [createSearch(), createSearch('pane')] });
}

describe('search scopes, inline nodes and seeding', () => {
  it('DOCE-SEARCH-1.5 keeps the find bar and the pane searches apart', () => {
    let state = stateWith([paragraph('cat and dog and cat')]);
    state = run(state, setSearch('cat'));
    state = run(state, setSearch('dog', {}, 'pane'));
    expect(searchState(state)?.matches).toHaveLength(2);
    expect(searchState(state, 'pane')?.matches).toHaveLength(1);
    state = run(state, selectNextMatch);
    expect(searchKey.getState(state)?.current).toBe(1);
    expect(searchPaneKey.getState(state)?.current).toBe(0);
    state = run(state, replaceAllMatches('cow', 'pane'));
    expect(textOf(state)).toBe('cat and cow and cat');
    expect(searchState(state)?.matches).toHaveLength(2);
    const view = new EditorView(document.createElement('div'), {
      state: run(state, setSearch('cat', {}, 'pane')),
    });
    expect(view.dom.querySelectorAll(`[${SEARCH_MATCH_ATTR}]`)).toHaveLength(2);
    expect(view.dom.querySelectorAll(`[${SEARCH_RESULT_ATTR}="current"]`)).toHaveLength(1);
    view.destroy();
  });

  it('DOCE-SEARCH-1.5 replaces from the pane without moving the selection', () => {
    let state = run(stateWith([paragraph('cat and cat')]), setSearch('cat', {}, 'pane'));
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 6)));
    state = run(state, revealMatchAt(1, 'pane'));
    state = run(state, replaceMatch('dog', 'pane'));
    expect(textOf(state)).toBe('cat and dog');
    expect(state.selection.from).toBe(6);
  });

  it('DOCE-SEARCH-1.6 finds the text inline nodes show, and never replaces it', () => {
    let state = run(stateWith([withInlineNodes()]), setSearch('@Ana'));
    expect(searchState(state)?.matches).toHaveLength(1);
    expect(replaceMatch('Bo')(state)).toBe(false);
    state = run(state, setSearch('pump'));
    expect(searchState(state)?.matches).toHaveLength(2);
    expect(searchResults(state).map((result) => result.replaceable)).toEqual([false, true]);
    expect(searchResults(state)[0]).toMatchObject({
      source: 'Ask @Ana about Pump 7 and pump care.',
      start: 15,
      end: 21,
    });
    state = run(state, replaceAllMatches('valve'));
    expect(textOf(state)).toContain('Pump 7 and valve care.');
    expect(searchState(state)?.matches).toHaveLength(1);
    expect(replaceAllMatches('valve')(state)).toBe(false);
  });

  it('DOCE-SEARCH-1.7 seeds a search with the text selected in one block', () => {
    const state = stateWith([withInlineNodes(), paragraph('Second block')]);
    const start = firstTextAt(state);
    const select = (from: number, to: number) =>
      state.apply(state.tr.setSelection(TextSelection.create(state.doc, start + from, start + to)));
    expect(searchSeed(state)).toBeNull();
    // "Ask " and the mention after it.
    expect(searchSeed(select(0, 5))).toBe('Ask @Ana');
    expect(searchSeed(select(1, 3))).toBe('sk');
    expect(searchSeed(select(0, 40))).toBeNull();
    const long = stateWith([paragraph('word '.repeat(60))]);
    const from = firstTextAt(long);
    const all = long.apply(long.tr.setSelection(TextSelection.create(long.doc, from, from + 250)));
    expect(searchSeed(all)).toBeNull();
  });
});
