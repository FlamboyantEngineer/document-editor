import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import { replaceTrigger, triggerAt } from './text-triggers.js';

const stateWith = (...content: StoredNode[]) => {
  const { doc } = readDocumentFile(
    { formatVersion: 1, sections: [{ name: null, content }] },
    documentSchema,
  );
  return EditorState.create({ doc });
};

const paragraph = (text: string): StoredNode => ({
  type: 'paragraph',
  content: text ? [{ type: 'text', text }] : [],
});

// The state with the caret at the end of the first text block.
function caretAtEnd(state: EditorState): EditorState {
  let end = -1;
  state.doc.descendants((node, pos) => {
    if (end < 0 && node.isTextblock) end = pos + 1 + node.content.size;
    return end < 0;
  });
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, end)));
}

const slash = { char: '/' };
const at = { char: '@', allowSpaces: true };

describe('triggerAt', () => {
  it('DOCE-EDITING-9.1 reads a trigger at the start of a block or after a space, with its query', () => {
    const start = caretAtEnd(stateWith(paragraph('/head')));
    expect(triggerAt(start, slash)).toMatchObject({ char: '/', query: 'head' });
    const match = triggerAt(start, slash);
    expect(match && start.doc.textBetween(match.from, match.to)).toBe('/head');
    expect(triggerAt(caretAtEnd(stateWith(paragraph('Some text /'))), slash)).toMatchObject({
      query: '',
    });
    expect(triggerAt(caretAtEnd(stateWith(paragraph('and/or'))), slash)).toBeNull();
    expect(triggerAt(caretAtEnd(stateWith(paragraph('/head more'))), slash)).toBeNull();
  });

  it('DOCE-EDITING-9.1 lets a query hold single spaces only when the trigger allows them', () => {
    expect(triggerAt(caretAtEnd(stateWith(paragraph('Ask @Ada Love'))), at)).toMatchObject({
      query: 'Ada Love',
    });
    expect(triggerAt(caretAtEnd(stateWith(paragraph('Ask @Ada  Love'))), at)).toBeNull();
    expect(triggerAt(caretAtEnd(stateWith(paragraph('mail a@b'))), at)).toBeNull();
  });

  it('DOCE-EDITING-9.1 reads nothing in code, over a range, or past the longest query', () => {
    expect(
      triggerAt(
        caretAtEnd(stateWith({ type: 'code_block', content: [{ type: 'text', text: '/x' }] })),
        slash,
      ),
    ).toBeNull();
    const state = caretAtEnd(stateWith(paragraph('/head')));
    const ranged = state.apply(
      state.tr.setSelection(
        TextSelection.create(state.doc, state.selection.from - 2, state.selection.from),
      ),
    );
    expect(triggerAt(ranged, slash)).toBeNull();
    expect(triggerAt(caretAtEnd(stateWith(paragraph(`/${'x'.repeat(41)}`))), slash)).toBeNull();
    expect(triggerAt(caretAtEnd(stateWith(paragraph(`${'y'.repeat(60)}/x`))), slash)).toBeNull();
    expect(
      triggerAt(caretAtEnd(stateWith(paragraph(`${'y'.repeat(60)} /x`))), slash),
    ).toMatchObject({ query: 'x' });
  });
});

describe('replaceTrigger', () => {
  it('DOCE-EDITING-9.1 takes the trigger text out, or puts a node in its place', () => {
    let state = caretAtEnd(stateWith(paragraph('Hi /head')));
    const match = triggerAt(state, slash);
    if (!match) throw new Error('no match');
    replaceTrigger(match)(state, (tr) => (state = state.apply(tr)));
    expect(state.doc.textBetween(0, state.doc.content.size)).toBe('Hi ');
    let mentioned = caretAtEnd(stateWith(paragraph('Hi @Ada')));
    const person = triggerAt(mentioned, at);
    const mention = documentSchema.nodes.mention;
    if (!person || !mention) throw new Error('no mention');
    const node = mention.create({ userId: 'u1', label: 'Ada' });
    replaceTrigger(person, node)(mentioned, (tr) => (mentioned = mentioned.apply(tr)));
    let found = false;
    mentioned.doc.descendants((each) => {
      found ||= each.type === mention;
    });
    expect(found).toBe(true);
    expect(replaceTrigger(person)(mentioned)).toBe(false);
  });
});
