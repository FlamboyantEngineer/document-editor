import type { Command, EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import {
  caretAt,
  footnoteParts,
  footnoteState,
  note,
  paragraph,
  runCommand,
  text,
} from '../../test/footnote-fixtures.js';
import { insertFootnote } from './footnotes.js';
import { acceptAllSuggestions, rejectAllSuggestions } from './suggestion-decisions.js';
import { suggestTransaction } from './suggestions.js';

// Runs a command in suggest mode, its change rewritten as a suggestion by a writer.
function suggest(state: EditorState, command: Command): EditorState {
  let next = state;
  command(state, (tr) => {
    const rewritten = suggestTransaction(tr, state, { author: 'writer', newId: () => 's0000001' });
    if (!rewritten) throw new Error('The change was not suggested.');
    next = state.apply(rewritten);
  });
  return next;
}

const markerMarks = (state: EditorState) => {
  const names: string[] = [];
  state.doc.descendants((node) => {
    if (node.type.name === 'footnote_reference') names.push(...node.marks.map((m) => m.type.name));
    return true;
  });
  return names;
};

describe('a footnote suggested', () => {
  const suggested = () => {
    let state = footnoteState([paragraph(text('Before after.'), note('n1', 'Old'))]);
    state = caretAt(state, 'after', -1);
    return suggest(state, insertFootnote({ newId: () => 'n0' }));
  };

  it('DOCE-SUGGESTIONS-1.5 DOCE-FOOTNOTES-1.1 suggests the marker, its entry following it, with the caret in the entry', () => {
    const state = suggested();
    expect(markerMarks(state)).toEqual(['insertion']);
    expect(footnoteParts(state)).toEqual(['marker:n0', 'marker:n1', 'entry:n0:', 'entry:n1:Old']);
    expect(footnoteParts(state, 'number')).toEqual([
      'marker:1',
      'marker:2',
      'entry:1:',
      'entry:2:Old',
    ]);
    expect(state.selection.$from.parent.attrs.footnoteId).toBe('n0');
  });

  it('DOCE-SUGGESTIONS-1.5 DOCE-FOOTNOTES-1.3 keeps the footnote when accepted and removes its entry when rejected', () => {
    const accepted = runCommand(suggested(), acceptAllSuggestions);
    expect(markerMarks(accepted)).not.toContain('insertion');
    expect(footnoteParts(accepted)).toEqual([
      'marker:n0',
      'marker:n1',
      'entry:n0:',
      'entry:n1:Old',
    ]);
    const rejected = runCommand(suggested(), rejectAllSuggestions);
    expect(footnoteParts(rejected)).toEqual(['marker:n1', 'entry:n1:Old']);
    expect(footnoteParts(rejected, 'number')).toEqual(['marker:1', 'entry:1:Old']);
  });
});
