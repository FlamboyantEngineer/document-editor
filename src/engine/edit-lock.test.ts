import type { Node } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import { createEditLock, isPositionLocked } from './edit-lock.js';

const paragraph = (value: string): StoredNode => ({
  type: 'paragraph',
  content: [{ type: 'text', text: value }],
});

// Locks the blocks whose text starts with "Fixed".
function lockedBlock(doc: Node, pos: number): boolean {
  const $pos = doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).isTextblock) return $pos.node(depth).textContent.startsWith('Fixed');
  }
  return false;
}

function stateOf() {
  const doc = readDocumentFile(
    {
      formatVersion: 1,
      sections: [{ name: null, content: [paragraph('Open'), paragraph('Fixed')] }],
    },
    documentSchema,
  ).doc;
  return EditorState.create({ doc, plugins: [createEditLock({ isLocked: lockedBlock })] });
}

const textOf = (state: EditorState) => state.doc.textBetween(0, state.doc.content.size);

const positionOf = (state: EditorState, value: string) => {
  let found = -1;
  state.doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text === value) found = pos;
  });
  return found;
};

describe('edit lock', () => {
  it('DOCE-EDITING-4.1 refuses the writer changes that touch a locked position', () => {
    const state = stateOf();
    const open = positionOf(state, 'Open');
    const fixed = positionOf(state, 'Fixed');
    expect(textOf(state.apply(state.tr.insertText('!', open + 4)))).toMatch(/Open!/);
    expect(textOf(state.apply(state.tr.insertText('!', fixed + 2)))).toMatch(/Fixed/);
    expect(textOf(state.apply(state.tr.insertText('!', fixed + 2)))).not.toMatch(/Fi!/);
    expect(textOf(state.apply(state.tr.delete(open + 2, fixed + 2)))).toBe('OpenFixed');
    expect(isPositionLocked(state, fixed + 1)).toBe(true);
    expect(isPositionLocked(state, open + 1)).toBe(false);
  });

  it('DOCE-EDITING-4.1 lets changes outside the history through', () => {
    const state = stateOf();
    const fixed = positionOf(state, 'Fixed');
    const tr = state.tr.insertText('!', fixed + 2).setMeta('addToHistory', false);
    expect(textOf(state.apply(tr))).toMatch(/Fi!xed/);
    const caret = state.apply(state.tr.setSelection(TextSelection.create(state.doc, fixed + 1)));
    expect(caret.selection.from).toBe(fixed + 1);
  });
});
