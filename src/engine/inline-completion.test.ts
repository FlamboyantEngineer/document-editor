import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile } from '../model/index.js';
import {
  acceptCompletion,
  completionRequest,
  createInlineCompletion,
  dismissCompletion,
  inlineCompletion,
  offerCompletion,
} from './inline-completion.js';

const provider = { complete: () => Promise.resolve({ ok: true as const, value: '' }) };

function stateAt(value: string, offset: number) {
  const doc = readDocumentFile(
    {
      formatVersion: 1,
      sections: [
        {
          name: null,
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Scope.' }] },
            { type: 'paragraph', content: [{ type: 'text', text: value }] },
          ],
        },
      ],
    },
    documentSchema,
  );
  let pos = -1;
  doc.descendants((node, at) => {
    if (node.isText && node.text === value) pos = at + offset;
  });
  const state = EditorState.create({ doc, plugins: [createInlineCompletion({ provider })] });
  return state.apply(state.tr.setSelection(TextSelection.create(doc, pos)));
}

describe('inline completion', () => {
  it('DOCE-AUTOMATION-3.1 asks for the text before the caret and the rest of its block', () => {
    const state = stateAt('Recovery takes time', 'Recovery takes'.length);
    expect(completionRequest(state)).toEqual({
      before: 'Scope.\nRecovery takes',
      after: ' time',
    });
    expect(completionRequest(state, 8)).toEqual({ before: 'ry takes', after: ' time' });
  });

  it('DOCE-AUTOMATION-3.2 takes an offer with its text, or dismisses it, and any change dismisses it', () => {
    let state = stateAt('Recovery takes', 'Recovery takes'.length);
    const pos = state.selection.head;
    offerCompletion({ pos, text: ' one second.' })(state, (tr) => (state = state.apply(tr)));
    expect(inlineCompletion(state)).toEqual({ pos, text: ' one second.' });
    acceptCompletion(state, (tr) => (state = state.apply(tr)));
    expect(state.doc.textBetween(0, state.doc.content.size)).toContain(
      'Recovery takes one second.',
    );
    expect(inlineCompletion(state)).toBeNull();
    offerCompletion({ pos: state.selection.head, text: ' Done.' })(
      state,
      (tr) => (state = state.apply(tr)),
    );
    expect(dismissCompletion(state, (tr) => (state = state.apply(tr)))).toBe(true);
    expect(inlineCompletion(state)).toBeNull();
    offerCompletion({ pos: state.selection.head, text: ' Done.' })(
      state,
      (tr) => (state = state.apply(tr)),
    );
    state = state.apply(state.tr.insertText('!'));
    expect(inlineCompletion(state)).toBeNull();
    expect(offerCompletion({ pos: 1, text: 'x' })(state)).toBe(false);
  });
});
