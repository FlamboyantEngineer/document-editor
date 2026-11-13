import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import { completionRequest, normalizeCompletion } from './completion-text.js';

function stateAt(content: StoredNode[], value: string, offset: number): EditorState {
  const doc = readDocumentFile(
    { formatVersion: 1, sections: [{ name: null, content }] },
    documentSchema,
  ).doc;
  let pos = -1;
  doc.descendants((node, at) => {
    if (pos < 0 && node.isText && node.text === value) pos = at + offset;
  });
  return EditorState.create({ doc, selection: TextSelection.create(doc, pos) });
}

const paragraph = (text: string, attrs?: Record<string, unknown>): StoredNode => ({
  type: 'paragraph',
  ...(attrs ? { attrs } : {}),
  content: [{ type: 'text', text }],
});

const request = (before: string, after = '') => ({
  before,
  after,
  elementId: null,
  blockType: 'paragraph',
});

describe('completion text', () => {
  it('DOCE-AUTOMATION-3.1 asks for the text before the caret, the rest of its block, and the block', () => {
    const content = [paragraph('Scope.'), paragraph('Recovery takes time')];
    const state = stateAt(content, 'Recovery takes time', 'Recovery takes'.length);
    const id: unknown = state.selection.$head.parent.attrs.dataId;
    expect(completionRequest(state)).toEqual({
      before: 'Scope.\nRecovery takes',
      after: ' time',
      elementId: typeof id === 'string' && id ? id : null,
      blockType: 'paragraph',
    });
    expect(completionRequest(state, 8)).toMatchObject({ before: 'ry takes', after: ' time' });
  });

  it('DOCE-AUTOMATION-3.1 asks nothing in code, in a footnote, or with nothing before the caret', () => {
    const code: StoredNode = { type: 'code_block', content: [{ type: 'text', text: 'let a' }] };
    expect(completionRequest(stateAt([code], 'let a', 5))).toBeNull();
    const noted: StoredNode = {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Body' },
        { type: 'footnote', attrs: { id: 'n1' }, content: [{ type: 'text', text: 'Note' }] },
      ],
    };
    const inNote = stateAt([noted], 'Note', 4);
    expect(inNote.selection.$head.parent.type.name).toBe('footnote_entry');
    expect(completionRequest(inNote)).toBeNull();
    expect(completionRequest(stateAt([paragraph('  ')], '  ', 2))).toBeNull();
  });

  it('DOCE-AUTOMATION-3.8 keeps the first line of an answer, without control characters', () => {
    expect(normalizeCompletion(' one second.\nAnd more.', request('Takes'))).toBe(' one second.');
    expect(normalizeCompletion(' one\tsecond\u0007.', request('Takes'))).toBe(' one second.');
    expect(normalizeCompletion('\n\nlater', request('Takes'))).toBe('');
    expect(normalizeCompletion('   ', request('Takes'))).toBe('');
  });

  it('DOCE-AUTOMATION-3.8 doubles no space and repeats no words the text after the caret has', () => {
    expect(normalizeCompletion('  one second.', request('Takes '))).toBe('one second.');
    expect(normalizeCompletion(' one second', request('Takes', ' second later'))).toBe(' one');
    expect(normalizeCompletion(' one second.', request('Takes', '.'))).toBe(' one second');
    // A part of a word is not the word after the caret.
    expect(normalizeCompletion(' is', request('It', 's good'))).toBe(' is');
  });
});
