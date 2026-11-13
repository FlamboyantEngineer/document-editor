import { type Command, EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema, parseMarkup } from '../../test/document-markup.js';
import { createFootnotes } from './footnotes.js';
import { acceptAllSuggestions, rejectAllSuggestions } from './suggestion-decisions.js';

const STRUCK =
  '<p data-id="aaaa0001">Keep <del data-id="bbbb0001" data-au="bea">gone</del> rest</p>';
const BOLD_STRUCK =
  '<p data-id="aaaa0001">Keep <strong><del data-id="bbbb0001" data-au="bea">gone</del></strong> rest</p>';
const ADDED =
  '<p data-id="aaaa0001">Keep <ins data-id="bbbb0002" data-au="bea">added</ins> rest</p>';

// A state with the caret `offset` characters into a piece of text, with the footnote plugin, which
// sets the caret's typing marks, unless told otherwise.
function stateAt(
  markup: string,
  [value, offset]: readonly [string, number],
  plugins = [createFootnotes()],
): EditorState {
  const doc = parseMarkup(markup);
  let at = -1;
  doc.descendants((node, pos) => {
    if (node.isText && node.text === value) at = pos + offset;
  });
  const state = EditorState.create({ doc, schema: documentSchema, plugins });
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, at)));
}

const typed = (state: EditorState, value: string) => state.apply(state.tr.insertText(value));

// The marks of the run of text that holds a piece of text.
function marksOf(state: EditorState, value: string): string[] | undefined {
  let found: string[] | undefined;
  state.doc.descendants((node) => {
    if (node.text?.includes(value)) found = node.marks.map((mark) => mark.type.name);
  });
  return found;
}

function decided(state: EditorState, command: Command): string {
  let next = state;
  command(state, (tr) => {
    next = state.apply(tr);
  });
  return next.doc.textContent;
}

describe('typing beside a suggestion without suggesting', () => {
  it('DOCE-SUGGESTIONS-1.8 keeps text typed right after a suggestion outside it, by the schema alone', () => {
    const afterStruck = typed(stateAt(STRUCK, ['gone', 4], []), 'NEW');
    expect(marksOf(afterStruck, 'NEW')).toEqual([]);
    expect(decided(afterStruck, acceptAllSuggestions)).toBe('Keep NEW rest');
    const afterAdded = typed(stateAt(ADDED, ['added', 5], []), 'NEW');
    expect(marksOf(afterAdded, 'NEW')).toEqual([]);
    expect(decided(afterAdded, rejectAllSuggestions)).toBe('Keep NEW rest');
  });

  it('DOCE-SUGGESTIONS-1.8 keeps text typed inside struck text out of the deletion, with its formatting', () => {
    const inside = stateAt(BOLD_STRUCK, ['gone', 2]);
    expect(inside.storedMarks?.map((mark) => mark.type.name)).toEqual(['strong']);
    const next = typed(inside, 'NEW');
    expect(marksOf(next, 'NEW')).toEqual(['strong']);
    expect(decided(next, acceptAllSuggestions)).toBe('Keep NEW rest');
  });

  it('DOCE-SUGGESTIONS-1.8 joins text typed inside a suggested insertion to it', () => {
    const next = typed(stateAt(ADDED, ['added', 2]), 'NEW');
    expect(decided(next, rejectAllSuggestions)).toBe('Keep  rest');
  });

  it('DOCE-SUGGESTIONS-1.8 keeps the marks the writer chose for the caret', () => {
    const { em } = documentSchema.marks;
    if (!em) throw new Error('No emphasis mark');
    const inside = stateAt(STRUCK, ['gone', 2]);
    const chosen = inside.apply(inside.tr.setStoredMarks([em.create()]));
    expect(chosen.storedMarks?.map((mark) => mark.type.name)).toEqual(['em']);
  });
});
