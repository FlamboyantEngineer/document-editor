import { lift } from 'prosemirror-commands';
import type { Node } from 'prosemirror-model';
import { wrapInList } from 'prosemirror-schema-list';
import { type Command, EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import { createDocumentEditing } from './document-editing.js';
import {
  markSuggestionRefused,
  suggestionRefusalOf,
  suggestionRefusalReason,
} from './suggestion-refusal.js';
import { suggestTransaction } from './suggestions.js';
import { insertTable } from './tables.js';

const paragraph = (value: string): StoredNode => ({
  type: 'paragraph',
  content: [{ type: 'text', text: value }],
});

function stateOf(...content: StoredNode[]): EditorState {
  const doc = readDocumentFile(
    { formatVersion: 1, sections: [{ name: null, content }] },
    documentSchema,
  ).doc;
  return EditorState.create({ doc, plugins: createDocumentEditing(documentSchema) });
}

function caretIn(state: EditorState, value: string): EditorState {
  let at = -1;
  state.doc.descendants((node: Node, pos) => {
    if (at < 0 && node.isText && node.text?.includes(value)) at = pos + 1;
    return at < 0;
  });
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, at)));
}

// What suggest mode does with a command's change: the state after it, and why it was refused.
function suggested(state: EditorState, command: Command) {
  let after = state;
  command(state, (tr) => {
    const made =
      suggestTransaction(tr, state, { author: 'writer' }) ?? markSuggestionRefused(state, tr);
    after = state.apply(made);
  });
  return after;
}

// Wraps the selected blocks in a bulleted list.
const wrapInBullets: Command = (state, dispatch) => {
  const bullets = state.schema.nodes.bullet_list;
  return bullets ? wrapInList(bullets)(state, dispatch) : false;
};

describe('a change suggest mode cannot record', () => {
  it('DOCE-SUGGESTIONS-1.5 says why a change was refused, and changes nothing else', () => {
    const state = caretIn(stateOf(paragraph('Alpha')), 'Alpha');
    const wrapped = suggested(state, wrapInBullets);
    expect(wrapped.doc.eq(state.doc)).toBe(true);
    expect(suggestionRefusalOf(wrapped)).toEqual({ reason: 'structure', count: 1 });
  });

  it('DOCE-SUGGESTIONS-1.5 tells a refused structure change from a block that cannot be suggested', () => {
    const state = caretIn(stateOf(paragraph('Alpha')), 'Alpha');
    let reason = '';
    wrapInBullets(state, (tr) => {
      reason = suggestionRefusalReason(tr);
    });
    expect(reason).toBe('structure');
    const quoted = caretIn(stateOf({ type: 'blockquote', content: [paragraph('Said')] }), 'Said');
    lift(quoted, (tr) => {
      reason = suggestionRefusalReason(tr);
    });
    expect(reason).toBe('structure');
    insertTable({ rows: 2, columns: 2 })(state, (tr) => {
      reason = suggestionRefusalReason(tr);
    });
    expect(reason).toBe('block');
  });

  it('DOCE-SUGGESTIONS-1.5 forgets the refusal at the writer’s next change, and counts a new one', () => {
    const state = caretIn(stateOf(paragraph('Alpha')), 'Alpha');
    const wrap = wrapInBullets;
    const refused = suggested(state, wrap);
    const typed = refused.apply(refused.tr.insertText('X'));
    expect(suggestionRefusalOf(typed)).toBeNull();
    expect(suggestionRefusalOf(suggested(typed, wrap))).toEqual({ reason: 'structure', count: 2 });
  });
});
