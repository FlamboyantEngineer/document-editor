import { lift, wrapIn } from 'prosemirror-commands';
import type { Node } from 'prosemirror-model';
import { liftListItem, sinkListItem, wrapInList } from 'prosemirror-schema-list';
import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { caretAt, runCommand } from '../../test/footnote-fixtures.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import { createEditLock, isPositionLocked } from './edit-lock.js';
import { markDerived, markRemote, markSystemChange } from './transaction-kind.js';

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

const PARAGRAPHS = [paragraph('Open'), paragraph('Fixed'), paragraph('Also open')];

function stateOf(content: StoredNode[] = PARAGRAPHS) {
  const doc = readDocumentFile(
    { formatVersion: 1, sections: [{ name: null, content }] },
    documentSchema,
  ).doc;
  return EditorState.create({ doc, plugins: [createEditLock({ isLocked: lockedBlock })] });
}

const listOf = (...items: string[]): StoredNode => ({
  type: 'bulletList',
  content: items.map((item) => ({ type: 'listItem', content: [paragraph(item)] })),
});

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
    expect(textOf(state.apply(state.tr.delete(open + 2, fixed + 2)))).toBe('OpenFixedAlso open');
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

  it('DOCE-EDITING-4.1 refuses a step that spans a locked block between open ones', () => {
    const state = stateOf();
    const open = positionOf(state, 'Open');
    const after = positionOf(state, 'Also open');
    expect(textOf(state.apply(state.tr.delete(open + 2, after + 2)))).toBe('OpenFixedAlso open');
    const typed = state.apply(state.tr.replaceWith(open + 2, after + 2, state.schema.text('x')));
    expect(textOf(typed)).toBe('OpenFixedAlso open');
  });

  it('DOCE-EDITING-4.1 refuses marks and attributes set on locked content, but takes comments', () => {
    const state = stateOf();
    const fixed = positionOf(state, 'Fixed');
    const open = positionOf(state, 'Open');
    const strong = state.schema.mark('strong');
    expect(state.apply(state.tr.addMark(fixed, fixed + 5, strong)).doc.eq(state.doc)).toBe(true);
    expect(state.apply(state.tr.addMark(open, open + 4, strong)).doc.eq(state.doc)).toBe(false);
    const block = fixed - 1;
    const marked = state.tr.setNodeMarkup(block, undefined, {
      ...state.doc.nodeAt(block)?.attrs,
      className: 'x',
    });
    expect(state.apply(marked).doc.eq(state.doc)).toBe(true);
    const attr = state.tr.setNodeAttribute(block, 'className', 'x');
    expect(state.apply(attr).doc.eq(state.doc)).toBe(true);
    const comment = state.schema.mark('comment_highlight', { commentId: 'c1' });
    expect(state.apply(state.tr.addMark(fixed, fixed + 5, comment)).doc.eq(state.doc)).toBe(false);
  });

  it('DOCE-EDITING-4.1 refuses a structure change that moves a locked block', () => {
    const { bullet_list: bullets, list_item: item, blockquote } = documentSchema.nodes;
    if (!bullets || !item || !blockquote) throw new Error('No lists or quotes');
    const plain = stateOf();
    for (const wrap of [wrapInList(bullets), wrapIn(blockquote)]) {
      expect(runCommand(caretAt(plain, 'Fixed'), wrap).doc.eq(plain.doc)).toBe(true);
      expect(runCommand(caretAt(plain, 'Open'), wrap).doc.eq(plain.doc)).toBe(false);
    }
    const ends = [positionOf(plain, 'Open'), positionOf(plain, 'Also open')] as const;
    const spanning = plain.apply(plain.tr.setSelection(TextSelection.create(plain.doc, ...ends)));
    expect(runCommand(spanning, wrapInList(bullets)).doc.eq(plain.doc)).toBe(true);
    const listed = stateOf([listOf('Open', 'Fixed', 'Also open')]);
    for (const move of [sinkListItem(item), liftListItem(item)]) {
      expect(runCommand(caretAt(listed, 'Fixed'), move).doc.eq(listed.doc)).toBe(true);
      expect(runCommand(caretAt(listed, 'Also open'), move).doc.eq(listed.doc)).toBe(false);
    }
    const quoted = stateOf([{ type: 'blockquote', content: [paragraph('Fixed')] }]);
    expect(runCommand(caretAt(quoted, 'Fixed'), lift).doc.eq(quoted.doc)).toBe(true);
  });

  it('DOCE-EDITING-4.1 lets the block around a locked one change its type and attributes', () => {
    const { ordered_list: numbered } = documentSchema.nodes;
    const state = stateOf([listOf('Open', 'Fixed')]);
    const list = state.doc.resolve(positionOf(state, 'Open')).before(-2);
    const retyped = state.apply(state.tr.setNodeMarkup(list, numbered));
    expect(retyped.doc.nodeAt(list)?.type).toBe(numbered);
    expect(textOf(retyped)).toBe(textOf(state));
  });

  it('DOCE-EDITING-4.1 lets remote, derived and system changes to locked content through', () => {
    const state = stateOf();
    const fixed = positionOf(state, 'Fixed');
    const typed = () => state.tr.insertText('!', fixed + 2);
    for (const tr of [markRemote(typed()), markDerived(typed()), markSystemChange(typed())])
      expect(textOf(state.apply(tr))).toMatch(/Fi!xed/);
  });
});
