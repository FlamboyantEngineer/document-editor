import type { Node } from 'prosemirror-model';
import { EditorState, type Transaction } from 'prosemirror-state';
import { Step } from 'prosemirror-transform';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { BASE_TEMPLATE, readDocumentFile, type StoredNode } from '../model/index.js';
import { createDocumentEditing } from './document-editing.js';
import { createDocumentSections } from './document-sections.js';
import { markRemote } from './transaction-kind.js';

// Two people's editors on one document: the sender's steps reach the receiver as one remote
// change, as a realtime binding applies them.

const cell = (value: string, colwidth: number): StoredNode => ({
  type: 'tableCell',
  attrs: { colwidth: [colwidth] },
  content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }],
});

const DOC = readDocumentFile(
  {
    formatVersion: 1,
    sections: [
      {
        name: null,
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Shared text' }] },
          {
            type: 'table',
            content: [
              { type: 'tableRow', content: [cell('A1', 100), cell('B1', 200)] },
              { type: 'tableRow', content: [cell('A2', 100), cell('B2', 200)] },
            ],
          },
        ],
      },
    ],
  },
  documentSchema,
).doc;

function editorOf(doc: Node): EditorState {
  const template = () => BASE_TEMPLATE;
  return EditorState.create({
    doc,
    plugins: [
      ...createDocumentEditing(documentSchema, { template, history: false }),
      createDocumentSections({ template }),
    ],
  });
}

// Settles a state as an editor would after opening, so both sides start from the same document.
function opened(): EditorState {
  const state = editorOf(DOC);
  return state.apply(state.tr.insertText('', 1));
}

const positionOf = (doc: Node, value: string) => {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text === value) found = pos;
  });
  return found;
};

const cellBefore = (doc: Node, value: string) => doc.resolve(positionOf(doc, value)).before(-1);

// Widens the second column in both rows, so the table stays consistent and only its width is off.
function widen(state: EditorState) {
  const tr = state.tr;
  for (const value of ['B1', 'B2']) {
    const at = cellBefore(tr.doc, value);
    tr.setNodeMarkup(at, undefined, { ...tr.doc.nodeAt(at)?.attrs, colwidth: [5000] });
  }
  return state.applyTransaction(tr);
}

// Sends each of the sender's transactions through JSON as its own remote change, as a binding may
// deliver a change before what the sender's plugins appended to it. Gives the receiver's state and
// how many transactions each remote change became there.
function send(transactions: readonly Transaction[], receiver: EditorState) {
  let state = receiver;
  const applied: number[] = [];
  for (const each of transactions) {
    const tr = state.tr;
    for (const step of each.steps) tr.step(Step.fromJSON(documentSchema, step.toJSON()));
    const result = state.applyTransaction(markRemote(tr));
    applied.push(result.transactions.length);
    state = result.state;
  }
  return { state, applied };
}

describe('two editors on one document', () => {
  it('DOCE-EDITING-3.3 writes nothing derived on the receiving side of a widened table', () => {
    const sender = opened();
    const receiver = editorOf(sender.doc);
    const widened = widen(sender);
    expect(widened.transactions.length).toBeGreaterThan(1);
    const received = send(widened.transactions, receiver);
    expect(received.applied.every((count) => count === 1)).toBe(true);
    expect(received.state.doc.eq(widened.state.doc)).toBe(true);
  });

  it('DOCE-EDITING-3.3 writes nothing derived on the receiving side of typed text and a new block', () => {
    const sender = opened();
    const receiver = editorOf(sender.doc);
    const at = positionOf(sender.doc, 'Shared text') + 'Shared text'.length;
    const typed = sender.applyTransaction(sender.tr.insertText(' and more', at));
    const split = typed.state.applyTransaction(typed.state.tr.split(at + 4));
    const received = send([...typed.transactions, ...split.transactions], receiver);
    expect(received.applied.every((count) => count === 1)).toBe(true);
    expect(received.state.doc.eq(split.state.doc)).toBe(true);
  });

  it('DOCE-EDITING-3.3 writes nothing derived on the receiving side of one widened cell', () => {
    const sender = opened();
    const receiver = editorOf(sender.doc);
    const at = cellBefore(sender.doc, 'B1');
    const widened = sender.applyTransaction(
      sender.tr.setNodeMarkup(at, undefined, { ...sender.doc.nodeAt(at)?.attrs, colwidth: [5000] }),
    );
    expect(widened.transactions.length).toBeGreaterThan(1);
    const received = send(widened.transactions, receiver);
    expect(received.applied.every((count) => count === 1)).toBe(true);
    expect(received.state.doc.eq(widened.state.doc)).toBe(true);
  });

  it('DOCE-EDITING-3.3 still derives writes from the receiver’s own changes', () => {
    const receiver = opened();
    const widened = widen(receiver);
    expect(widened.transactions.length).toBeGreaterThan(1);
  });
});
