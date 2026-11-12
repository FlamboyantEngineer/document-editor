import { Slice } from 'prosemirror-model';
import { EditorState, Plugin, TextSelection, type Transaction } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import {
  clearCopiedIdentity,
  createDocumentEditing,
  createDocumentSchema,
  createEditLock,
  type IdentityAttribute,
} from '../src/index.js';
import { parseMarkup } from './document-markup.js';

// The recipe in docs/recipes/element-lifecycle.md, built from the public entry point.
const reviewState: IdentityAttribute = {
  name: 'reviewState',
  dom: 'data-review-state',
  scope: ['paragraph', 'heading'],
  onCopy: 'clear',
};
const schema = createDocumentSchema({ schema: { identityAttributes: [reviewState] } });

const stamp = new Plugin({
  appendTransaction(transactions, _before, state) {
    if (!transactions.some((tr) => tr.docChanged)) return null;
    const tr = state.tr;
    state.doc.descendants((node, pos) => {
      if ('reviewState' in node.attrs && !node.attrs.reviewState)
        tr.setNodeMarkup(pos, null, { ...node.attrs, reviewState: 'draft' });
    });
    return tr.docChanged ? tr.setMeta('addToHistory', false) : null;
  },
});

const lock = createEditLock({
  isLocked: (doc, pos) => {
    const $pos = doc.resolve(pos);
    for (let depth = $pos.depth; depth > 0; depth -= 1)
      if ($pos.node(depth).attrs.reviewState === 'approved') return true;
    return false;
  },
});

function open(html: string) {
  const doc = parseMarkup(html, schema);
  return EditorState.create({
    doc,
    plugins: [lock, stamp, ...createDocumentEditing(schema, { author: () => 'ada' })],
  });
}

const apply = (state: EditorState, tr: Transaction) => state.applyTransaction(tr).state;
const states = (state: EditorState) =>
  state.doc.children.map((node) => `${node.textContent}:${String(node.attrs.reviewState)}`);

const SOURCE =
  '<p data-id="aaaa0001" data-review-state="approved">Fixed</p>' +
  '<p data-id="aaaa0002" data-review-state="draft">Open</p>';

describe('the element lifecycle recipe', () => {
  it('DOCE-EDITING-1.6 stamps new elements and clears the state of a pasted copy', () => {
    let state = open(SOURCE);
    const end = state.doc.content.size;
    state = apply(state, state.tr.insert(end, schema.node('paragraph', null, schema.text('New'))));
    const copy = clearCopiedIdentity(
      new Slice(state.doc.content.cut(0, state.doc.child(0).nodeSize), 0, 0),
    );
    state = apply(state, state.tr.replace(state.doc.content.size, state.doc.content.size, copy));
    expect(states(state)).toEqual(['Fixed:approved', 'Open:draft', 'New:draft', 'Fixed:draft']);
  });

  it('DOCE-EDITING-1.6 refuses edits inside a frozen element and merges into it', () => {
    let state = open(SOURCE);
    const before = state.doc;
    state = apply(state, state.tr.insertText('!', 2));
    expect(state.doc.eq(before)).toBe(true);
    // Backspace at the start of the draft would join it into the approved paragraph.
    const draftStart = state.doc.child(0).nodeSize + 1;
    state = apply(state, state.tr.setSelection(TextSelection.create(state.doc, draftStart)));
    state = apply(state, state.tr.join(draftStart - 1));
    expect(states(state)).toEqual(['Fixed:approved', 'Open:draft']);
    state = apply(state, state.tr.insertText('ed', draftStart + 'Open'.length));
    expect(states(state)).toEqual(['Fixed:approved', 'Opened:draft']);
  });
});
