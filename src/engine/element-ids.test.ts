import { Slice } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { findNode, parseMarkup } from '../../test/document-markup.js';
import { createDocumentSchema, type IdentityAttribute } from '../model/index.js';
import { clearCopiedIdentity, createElementIds } from './element-ids.js';

const ORIGIN: IdentityAttribute = { name: 'origin', dom: 'data-origin', onCopy: 'keep' };
const REVIEW: IdentityAttribute = { name: 'review', dom: 'data-review', onCopy: 'clear' };

const SOURCE =
  '<p data-id="aaaa0001" data-au="ada" data-ai="s1">One <span data-au="agent" data-ai="s2">two</span></p>' +
  '<ul data-id="aaaa0002" data-au="ada"><li data-id="aaaa0003"><p data-id="aaaa0004">Item</p></li></ul>';

describe('clearCopiedIdentity', () => {
  it('DOCE-EDITING-1.5 clears the ids, authors and contributors of pasted content', () => {
    const doc = parseMarkup(SOURCE);
    const pasted = clearCopiedIdentity(new Slice(doc.content, 0, 0));
    pasted.content.descendants((node) => {
      if (node.isText) {
        expect(node.marks.map((mark) => mark.type.name)).not.toContain('contributor');
      } else {
        expect(node.attrs).toMatchObject({ dataId: null, dataAuthor: null, dataAiSession: null });
      }
    });
    expect(pasted.content.textBetween(0, pasted.content.size)).toBe('One twoItem');
  });

  it('DOCE-EDITING-1.5 keeps the open depths and the identity attributes a copy keeps', () => {
    const schema = createDocumentSchema({ schema: { identityAttributes: [ORIGIN, REVIEW] } });
    const doc = parseMarkup(
      '<p data-id="aaaa0001" data-origin="import" data-review="done">Text</p>',
      schema,
    );
    const pasted = clearCopiedIdentity(new Slice(doc.content, 1, 1));
    expect(pasted.openStart).toBe(1);
    expect(pasted.openEnd).toBe(1);
    expect(pasted.content.firstChild?.attrs).toMatchObject({
      dataId: null,
      origin: 'import',
      review: null,
    });
  });

  it('DOCE-EDITING-1.5 gives a copy pasted above its original a new id, by the paster', () => {
    const doc = parseMarkup('<p data-id="aaaa0001" data-au="ada">Original</p>');
    let state = EditorState.create({
      doc,
      plugins: [createElementIds({ author: () => 'bea', newId: () => 'bbbb0001' })],
    });
    const copy = clearCopiedIdentity(new Slice(doc.content, 0, 0));
    state = state.applyTransaction(state.tr.replace(0, 0, copy)).state;
    const [first, second] = [state.doc.child(0), state.doc.child(1)];
    expect(first.attrs).toMatchObject({ dataId: 'bbbb0001', dataAuthor: 'bea' });
    expect(second.attrs).toMatchObject({ dataId: 'aaaa0001', dataAuthor: 'ada' });
    expect(findNode(state.doc, 'paragraph')?.textContent).toBe('Original');
  });
});
