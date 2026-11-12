import { EditorState, Plugin } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import {
  isDerivedTransaction,
  isInlineTextOnly,
  isLocalEdit,
  isRemoteTransaction,
  isSystemChange,
  markDerived,
  markRemote,
  markSystemChange,
} from './transaction-kind.js';

const paragraph = (value: string): StoredNode => ({
  type: 'paragraph',
  content: [{ type: 'text', text: value }],
});

function stateOf(plugins: Plugin[] = []) {
  const doc = readDocumentFile(
    {
      formatVersion: 1,
      sections: [{ name: null, content: [paragraph('First line'), paragraph('Second line')] }],
    },
    documentSchema,
  );
  return EditorState.create({ doc, plugins });
}

const positionOf = (state: EditorState, value: string) => {
  let found = -1;
  state.doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text === value) found = pos;
  });
  return found;
};

describe('transaction kinds', () => {
  it('DOCE-COLLAB-2.1 marks remote changes and keeps them out of the history', () => {
    const state = stateOf();
    const tr = markRemote(state.tr.insertText('!', positionOf(state, 'First line')));
    expect(isRemoteTransaction(tr)).toBe(true);
    expect(tr.getMeta('addToHistory')).toBe(false);
    expect(isRemoteTransaction(state.tr)).toBe(false);
  });

  it('DOCE-EDITING-3.2 counts marked and appended changes as derived, out of the history', () => {
    const appender = new Plugin({
      appendTransaction: (transactions, _before, after) => {
        if (transactions.some((tr) => tr.getMeta('appendedTransaction'))) return null;
        return after.tr.insertText('.', 1);
      },
    });
    const state = stateOf([appender]);
    const marked = markDerived(state.tr.insertText('x', 1));
    expect(isDerivedTransaction(marked)).toBe(true);
    expect(marked.getMeta('addToHistory')).toBe(false);
    const { transactions } = state.applyTransaction(state.tr.insertText('y', 1));
    expect(transactions.map(isDerivedTransaction)).toEqual([false, true]);
  });

  it('DOCE-EDITING-3.2 marks system changes and leaves their history setting alone', () => {
    const state = stateOf();
    const tr = markSystemChange(state.tr.insertText('x', 1));
    expect(isSystemChange(tr)).toBe(true);
    expect(tr.getMeta('addToHistory')).toBeUndefined();
    expect(isSystemChange(state.tr.insertText('x', 1))).toBe(false);
  });

  it('DOCE-EDITING-3.2 tells the writer’s own edits from remote, derived, system and empty changes', () => {
    const state = stateOf();
    const typed = () => state.tr.insertText('x', positionOf(state, 'First line'));
    expect(isLocalEdit(typed())).toBe(true);
    expect(isLocalEdit(state.tr)).toBe(false);
    expect(isLocalEdit(markRemote(typed()))).toBe(false);
    expect(isLocalEdit(markDerived(typed()))).toBe(false);
    expect(isLocalEdit(markSystemChange(typed()))).toBe(false);
    const fromElsewhere = typed();
    expect(isLocalEdit(fromElsewhere, (tr) => tr === fromElsewhere)).toBe(false);
  });

  it('DOCE-EDITING-3.2 finds changes that only type or delete text inside one textblock', () => {
    const state = stateOf();
    const first = positionOf(state, 'First line');
    const second = positionOf(state, 'Second line');
    const { schema } = state;
    expect(isInlineTextOnly(state.tr.insertText('Our ', first))).toBe(true);
    expect(isInlineTextOnly(state.tr.delete(first, first + 5))).toBe(true);
    expect(isInlineTextOnly(state.tr.insertText('x', first).insertText('y', second + 1))).toBe(
      true,
    );
    expect(
      isInlineTextOnly(state.tr.insert(first, schema.text('Bold', [schema.mark('strong')]))),
    ).toBe(true);
  });

  it('DOCE-EDITING-3.2 refuses block, inline node, mark and empty changes as inline text', () => {
    const state = stateOf();
    const first = positionOf(state, 'First line');
    const second = positionOf(state, 'Second line');
    const { schema } = state;
    expect(isInlineTextOnly(state.tr)).toBe(false);
    expect(isInlineTextOnly(state.tr.split(first + 5))).toBe(false);
    expect(isInlineTextOnly(state.tr.delete(first + 5, second + 3))).toBe(false);
    expect(isInlineTextOnly(state.tr.insert(first, schema.node('hard_break')))).toBe(false);
    expect(isInlineTextOnly(state.tr.addMark(first, first + 5, schema.mark('strong')))).toBe(false);
    const withBreak = state.apply(state.tr.insert(first + 5, schema.node('hard_break')));
    expect(isInlineTextOnly(withBreak.tr.delete(first + 4, first + 7))).toBe(false);
  });
});
