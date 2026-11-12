import { type Command, EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import { documentKeys } from './document-editing.js';
import {
  canInsertFootnote,
  createFootnotes,
  deleteFootnote,
  footnoteAt,
  insertFootnote,
  listFootnotes,
} from './footnotes.js';

const text = (value: string): StoredNode => ({ type: 'text', text: value });
const note = (id: string, value: string): StoredNode => ({
  type: 'footnote',
  attrs: { id },
  content: [text(value)],
});

function stateOf(...content: StoredNode[]) {
  const doc = readDocumentFile(
    { formatVersion: 1, sections: [{ name: null, content }] },
    documentSchema,
  ).doc;
  return EditorState.create({ doc, plugins: [createFootnotes()] });
}

function at(state: EditorState, value: string, offset = 0) {
  let found = -1;
  state.doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text?.includes(value)) {
      found = pos + (node.text.indexOf(value) ?? 0) + offset;
    }
    return found < 0;
  });
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, found)));
}

function run(state: EditorState, command: Command): EditorState {
  let next = state;
  expect(command(state, (tr) => (next = next.apply(tr)))).toBe(true);
  return next;
}

const numbers = (state: EditorState) => {
  const found: string[] = [];
  state.doc.descendants((node) => {
    if (node.type.name === 'footnote_reference' || node.type.name === 'footnote_entry') {
      found.push(
        `${node.type.name === 'footnote_entry' ? 'entry' : 'marker'}:${String(node.attrs.footnoteNumber)}`,
      );
    }
  });
  return found;
};

describe('footnotes', () => {
  it('DOCE-FOOTNOTES-1.1 inserts a marker and an entry, numbered, with the caret in the entry', () => {
    let state = stateOf({ type: 'paragraph', content: [text('Before after.'), note('n1', 'Old')] });
    state = at(state, 'after', -1);
    state = run(state, insertFootnote({ newId: () => 'n0' }));
    expect(state.selection.$from.parent.type.name).toBe('footnote_entry');
    expect(state.selection.$from.parent.attrs.footnoteId).toBe('n0');
    expect(numbers(state)).toEqual(['marker:1', 'marker:2', 'entry:2', 'entry:1']);
    const key = documentKeys(documentSchema)['Mod-Alt-f'];
    expect(key?.(at(state, 'Before'))).toBe(true);
  });

  it('DOCE-FOOTNOTES-1.2 is refused outside a paragraph of the body', () => {
    const state = at(
      stateOf({ type: 'heading', attrs: { level: 1 }, content: [text('Title')] }),
      'Title',
    );
    expect(canInsertFootnote(state)).toBe(false);
    expect(insertFootnote()(state)).toBe(false);
  });

  it('DOCE-FOOTNOTES-1.3 deletes an entry whose marker is deleted, and renumbers', () => {
    let state = stateOf({
      type: 'paragraph',
      content: [text('One'), note('n1', 'First'), text(' two'), note('n2', 'Second')],
    });
    const marker = listFootnotes(state.doc).get('n1')?.marker ?? 0;
    state = state.apply(state.tr.delete(marker, marker + 1));
    expect([...listFootnotes(state.doc).keys()]).toEqual(['n2']);
    expect(numbers(state)).toEqual(['marker:1', 'entry:1']);
  });

  it('DOCE-FOOTNOTES-1.4 finds the footnote at the selection and deletes it whole', () => {
    let state = stateOf({ type: 'paragraph', content: [text('One'), note('n1', 'First')] });
    state = at(state, 'First');
    expect(footnoteAt(state)?.id).toBe('n1');
    state = run(state, deleteFootnote('n1'));
    expect(listFootnotes(state.doc).size).toBe(0);
  });
});
