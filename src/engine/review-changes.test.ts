import type { Node } from 'prosemirror-model';
import { type Command, EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import {
  addCommentAnchor,
  linkSuggestionThread,
  removeCommentAnchor,
  setCommentState,
} from './comments.js';
import { createEditLock } from './edit-lock.js';
import { isReviewOnlyChange, reviewChangeOf } from './review-changes.js';
import { suggestTransaction } from './suggestions.js';

const paragraph = (value: string): StoredNode => ({
  type: 'paragraph',
  content: [{ type: 'text', text: value }],
});

const DOC = readDocumentFile(
  {
    formatVersion: 1,
    sections: [{ name: null, content: [paragraph('Open text'), paragraph('Fixed text')] }],
  },
  documentSchema,
).doc;

function positionOf(doc: Node, value: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text?.includes(value))
      found = pos + node.text.indexOf(value);
    return found < 0;
  });
  return found;
}

// A state with a word selected.
function selecting(word: string, state = EditorState.create({ doc: DOC })): EditorState {
  const from = positionOf(state.doc, word);
  return state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, from, from + word.length)),
  );
}

// The transaction a command dispatches.
function transactionOf(state: EditorState, command: Command): Transaction {
  let found: Transaction | null = null;
  command(state, (tr) => (found = tr));
  if (!found) throw new Error('The command should run.');
  return found;
}

describe('review-only changes', () => {
  it('DOCE-COMMENTS-1.13 finds anchoring, resolving and removing a thread review-only', () => {
    const state = selecting('text');
    const anchor = transactionOf(state, addCommentAnchor('t1'));
    expect(reviewChangeOf(anchor)).toEqual({ threads: ['t1'], suggestions: [] });
    const anchored = state.apply(anchor);
    expect(reviewChangeOf(transactionOf(anchored, setCommentState('t1', 'resolved')))).toEqual({
      threads: ['t1'],
      suggestions: [],
    });
    expect(isReviewOnlyChange(transactionOf(anchored, removeCommentAnchor('t1')))).toBe(true);
  });

  it('DOCE-COMMENTS-1.13 finds naming a suggestion thread review-only, and edits not', () => {
    const state = selecting('text');
    const suggest = suggestTransaction(state.tr.insertText('words'), state, {
      author: 'writer',
      newId: () => 's1',
    });
    expect(suggest && reviewChangeOf(suggest)).toBeNull();
    const suggested = suggest ? state.apply(suggest) : state;
    expect(reviewChangeOf(transactionOf(suggested, linkSuggestionThread('s1', 't1')))).toEqual({
      threads: ['t1'],
      suggestions: ['s1'],
    });
    const { strong } = documentSchema.marks;
    const at = positionOf(DOC, 'text');
    expect(strong && reviewChangeOf(state.tr.addMark(at, at + 4, strong.create()))).toBeNull();
    expect(reviewChangeOf(state.tr.insertText('!', at))).toBeNull();
    expect(reviewChangeOf(state.tr)).toBeNull();
    // Suggesting a deletion marks text without changing it, but it is content all the same.
    const deletion = suggestTransaction(state.tr.delete(at, at + 4), state, { author: 'writer' });
    expect(deletion && reviewChangeOf(deletion)).toBeNull();
  });

  it('DOCE-COMMENTS-1.13 lets comments onto locked content and refuses suggestions there', () => {
    const lock = createEditLock({
      isLocked: (doc, pos) => doc.resolve(pos).parent.textContent.startsWith('Fixed'),
    });
    const state = selecting('Fixed', EditorState.create({ doc: DOC, plugins: [lock] }));
    const anchored = state.apply(transactionOf(state, addCommentAnchor('t1')));
    expect(anchored.doc.eq(state.doc)).toBe(false);
    const at = positionOf(DOC, 'Fixed');
    const suggest = suggestTransaction(state.tr.insertText('Not ', at), state, { author: 'w' });
    expect(suggest && state.apply(suggest).doc.eq(state.doc)).toBe(true);
    const deletion = suggestTransaction(state.tr.delete(at, at + 5), state, { author: 'w' });
    expect(deletion && state.apply(deletion).doc.eq(state.doc)).toBe(true);
  });
});
