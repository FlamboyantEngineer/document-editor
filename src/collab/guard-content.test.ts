import { EditorState } from 'prosemirror-state';
import { expect, it } from 'vitest';
import { readFixture } from '../../test/collab-fixtures.js';
import { decideSuggestions } from '../engine/suggestion-decisions.js';
import { suggestTransaction } from '../engine/suggestions.js';
import type { DocumentFile } from '../model/index.js';
import { checkDocumentChange } from './guard-content.js';

const file: DocumentFile = {
  formatVersion: 1,
  sections: [
    {
      name: null,
      content: [
        {
          type: 'paragraph',
          attrs: { id: 'a0000001' },
          content: [{ type: 'text', text: 'Original text' }],
        },
      ],
    },
  ],
};
const permissions = { edit: false, suggest: true, comment: true, decide: false };

it.each(['insert', 'delete', 'format', 'split'] as const)(
  'DOCE-COLLAB-7.2 accepts a valid own %s proposal and its undo',
  (kind) => {
    const state = EditorState.create({ doc: readFixture(file) });
    let start = 0;
    state.doc.descendants((node, pos) => {
      if (node.isText) start = pos;
    });
    const input = state.tr;
    if (kind === 'insert') input.insertText('New ', start);
    if (kind === 'delete') input.delete(start, start + 3);
    if (kind === 'format') {
      const bold = state.schema.marks.strong;
      if (!bold) throw new Error('Missing mark.');
      input.addMark(start, start + 3, bold.create());
    }
    if (kind === 'split') input.split(start + 3);
    const proposal = suggestTransaction(input, state, {
      author: 'writer',
      newId: () => 'b0000001',
    });
    if (!proposal) throw new Error('Unsupported proposal.');
    expect(
      checkDocumentChange({ before: state.doc, after: proposal.doc, actor: 'writer', permissions }),
    ).toBe(true);
    expect(
      checkDocumentChange({ before: proposal.doc, after: state.doc, actor: 'writer', permissions }),
    ).toBe(true);
    const accepted = EditorState.create({ doc: proposal.doc }).tr;
    decideSuggestions(accepted, 'accept');
    expect(
      checkDocumentChange({
        before: proposal.doc,
        after: accepted.doc,
        actor: 'writer',
        permissions,
      }),
    ).toBe(false);
    expect(
      checkDocumentChange({
        before: proposal.doc,
        after: accepted.doc,
        actor: 'writer',
        permissions: { ...permissions, decide: true },
      }),
    ).toBe(true);
  },
);

it('DOCE-COLLAB-7.2 refuses direct formatting hidden beside an authorized decision', () => {
  const state = EditorState.create({ doc: readFixture(file) });
  let start = 0;
  state.doc.descendants((node, pos) => {
    if (node.isText) start = pos;
  });
  const proposal = suggestTransaction(state.tr.insertText('New ', start), state, {
    author: 'other',
    newId: () => 'b0000001',
  });
  if (!proposal) throw new Error('Unsupported proposal.');
  const tr = EditorState.create({ doc: proposal.doc }).tr;
  decideSuggestions(tr, 'accept');
  const bold = state.schema.marks.strong;
  if (!bold) throw new Error('Missing mark.');
  tr.addMark(start, start + 4, bold.create());
  expect(
    checkDocumentChange({
      before: proposal.doc,
      after: tr.doc,
      actor: 'writer',
      permissions: { ...permissions, suggest: false, decide: true },
    }),
  ).toBe(false);
});

it('DOCE-COLLAB-7.2 refuses relocating another author pending proposal', () => {
  const state = EditorState.create({ doc: readFixture(file) });
  let start = 0;
  state.doc.descendants((node, pos) => {
    if (node.isText) start = pos;
  });
  const insertion = state.schema.marks.insertion;
  if (!insertion) throw new Error('Missing insertion.');
  const mark = insertion.create({ dataId: 'b0000001', dataAuthor: 'other' });
  const before = state.tr.insertText('X', start).addMark(start, start + 1, mark).doc;
  const after = state.tr.insertText('X', start + 1).addMark(start + 1, start + 2, mark).doc;
  expect(checkDocumentChange({ before, after, actor: 'writer', permissions })).toBe(false);
});

it('DOCE-COLLAB-7.2 accepts authoring around another pending proposal without comparing absolute offsets', () => {
  const initial = EditorState.create({ doc: readFixture(file) });
  let start = 0;
  initial.doc.descendants((node, pos) => {
    if (node.isText) start = pos;
  });
  const insertion = initial.schema.marks.insertion;
  if (!insertion) throw new Error('Missing insertion.');
  const foreign = initial.tr
    .insertText('X', start)
    .addMark(start, start + 1, insertion.create({ dataId: 'b0000001', dataAuthor: 'other' })).doc;
  const state = EditorState.create({ doc: foreign });
  for (const at of [start, start + 2]) {
    const suggestion = suggestTransaction(state.tr.insertText('Own ', at), state, {
      author: 'writer',
      newId: () => 'c0000001',
    });
    if (!suggestion) throw new Error('Unsupported proposal.');
    expect(
      checkDocumentChange({ before: foreign, after: suggestion.doc, actor: 'writer', permissions }),
    ).toBe(true);
  }
  const prefix = state.tr.insertText('Prefix ', start).doc;
  expect(
    checkDocumentChange({
      before: foreign,
      after: prefix,
      actor: 'writer',
      permissions: { ...permissions, edit: true },
    }),
  ).toBe(true);
});
