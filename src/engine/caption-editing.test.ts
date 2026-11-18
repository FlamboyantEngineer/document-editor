import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import { editCaptionText } from './caption-editing.js';

const text = (value: string): StoredNode => ({ type: 'text', text: value });
const code = (caption: string, enabled = true): StoredNode => ({
  type: 'codeBlock',
  attrs: enabled ? {} : { captionEnabled: false },
  content: [{ type: 'caption', content: caption ? [text(caption)] : [] }, text('let a = 1;')],
});

const stateOf = (block: StoredNode) => {
  const doc = readDocumentFile(
    { formatVersion: 1, sections: [{ name: null, content: [block] }] },
    documentSchema,
  ).doc;
  const state = EditorState.create({ doc });
  let codeStart = 0;
  doc.descendants((node, pos) => {
    if (node.type.name === 'code_block') codeStart = pos + 1;
  });
  return state.apply(state.tr.setSelection(TextSelection.create(doc, codeStart + 2)));
};

const run = (state: EditorState) => {
  let next = state;
  const done = editCaptionText(state, (tr) => {
    next = state.apply(tr);
  });
  return { done, next };
};

describe('DOCE-OBJECTS-2.5 caption editing', () => {
  it('DOCE-OBJECTS-2.5 selects a code block’s caption text from its code', () => {
    const { done, next } = run(stateOf(code('Setup')));
    expect(done).toBe(true);
    const { $from, from, to } = next.selection;
    expect($from.parent.type.name).toBe('code_caption');
    expect(next.doc.textBetween(from, to)).toBe('Setup');
  });

  it('DOCE-OBJECTS-2.5 shows a hidden code caption and puts the caret in it', () => {
    const { done, next } = run(stateOf(code('', false)));
    expect(done).toBe(true);
    expect(next.selection.$from.parent.type.name).toBe('code_caption');
    let enabled: unknown;
    next.doc.descendants((node) => {
      if (node.type.name === 'code_block') enabled = node.attrs.captionEnabled;
    });
    expect(enabled).toBe(true);
  });
});
