import type { Node } from 'prosemirror-model';
import { type Command, EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema as schema } from '../../test/document-markup.js';
import { acceptAllSuggestions, rejectAllSuggestions } from '../engine/suggestion-decisions.js';
import { suggestTransaction } from '../engine/suggestions.js';
import { insertTable } from '../engine/tables.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import { checkDocumentChange } from './guard-content.js';

const suggestOnly = { edit: false, suggest: true, comment: true, decide: false };
const decider = { ...suggestOnly, decide: true };

const text = (value: string) => ({ type: 'text', text: value });
const paragraph = (value: string): StoredNode => ({ type: 'paragraph', content: [text(value)] });
const TABLE: StoredNode = {
  type: 'table',
  attrs: { id: 't0000001' },
  content: [
    { type: 'caption', content: [text('Limits')] },
    {
      type: 'tableRow',
      content: [{ type: 'tableCell', content: [paragraph('Cell')] }],
    },
  ],
};

const stateOf = (...content: StoredNode[]) =>
  EditorState.create({
    doc: readDocumentFile({ formatVersion: 1, sections: [{ name: null, content }] }, schema).doc,
  });

// Where a text starts.
function textAt(doc: Node, value: string): number {
  let at = -1;
  doc.descendants((node, pos) => {
    if (at < 0 && node.isText && node.text?.includes(value)) at = pos;
    return at < 0;
  });
  return at;
}

// The table's holder and where it starts.
function holderOf(doc: Node): { node: Node; pos: number } {
  let found: { node: Node; pos: number } | null = null;
  doc.descendants((node, pos) => {
    if (!found && node.type.name === 'table_figure') found = { node, pos };
    return !found;
  });
  if (!found) throw new Error('No table.');
  return found;
}

// A change rewritten as a suggestion by a writer, under a suggestion id.
function suggest(state: EditorState, change: Transaction, author: string, id = 's0000001') {
  const rewritten = suggestTransaction(change, state, { author, newId: () => id });
  if (!rewritten) throw new Error('The change was not suggested.');
  return state.apply(rewritten);
}

// A table the writer suggested inserting after the paragraph, with text suggested in its cell.
function suggestedTable(author = 'writer'): { before: EditorState; after: EditorState } {
  const start = stateOf(paragraph('Intro'));
  const before = start.apply(
    start.tr.setSelection(TextSelection.create(start.doc, textAt(start.doc, 'Intro'))),
  );
  let after = before;
  const command: Command = insertTable({ rows: 1, columns: 1 });
  command(before, (tr) => {
    after = suggest(before, tr, author);
  });
  return { before, after };
}

const decided = (state: EditorState, command: Command) => {
  let next = state;
  command(state, (tr) => {
    next = state.apply(tr);
  });
  return next;
};

const allowed = (before: EditorState, after: Node, actor: string, granted = suggestOnly) =>
  checkDocumentChange({ before: before.doc, after, actor, permissions: granted });

describe('DOCE-COLLAB-7.2 DOCE-SUGGESTIONS-1.4 a table suggested whole in a guarded room', () => {
  it('admits a writer’s own suggested table and its withdrawal, and refuses it under another name', () => {
    const { before, after } = suggestedTable();
    expect(holderOf(after.doc).node.attrs).toMatchObject({
      suggestionSplitKind: 'insertion',
      dataAuthor: 'writer',
    });
    expect(allowed(before, after.doc, 'writer')).toBe(true);
    expect(allowed(before, after.doc, 'mallory')).toBe(false);
    expect(allowed(after, before.doc, 'writer')).toBe(true);
    expect(allowed(after, decided(after, rejectAllSuggestions).doc, 'writer')).toBe(true);
  });

  it('refuses another writer taking a suggested table off or deciding it without the right to decide', () => {
    const { after } = suggestedTable();
    const rejected = decided(after, rejectAllSuggestions).doc;
    const accepted = decided(after, acceptAllSuggestions).doc;
    expect(allowed(after, rejected, 'mallory')).toBe(false);
    expect(allowed(after, accepted, 'mallory')).toBe(false);
    expect(allowed(after, accepted, 'mallory', decider)).toBe(true);
    expect(allowed(after, rejected, 'mallory', decider)).toBe(true);
  });

  it('refuses a whole table marked for deletion without the writer’s own marks, and admits an honest one', () => {
    const before = stateOf(paragraph('Intro'), TABLE);
    const { node, pos } = holderOf(before.doc);
    const forged = before.tr.setNodeMarkup(pos, null, {
      ...node.attrs,
      suggestionSplitKind: 'deletion',
      suggestionSplitId: 's0000009',
    });
    expect(allowed(before, forged.doc, 'mallory')).toBe(false);
    const honest = suggest(before, before.tr.delete(pos, pos + node.nodeSize), 'writer');
    expect(holderOf(honest.doc).node.attrs.suggestionSplitKind).toBe('deletion');
    expect(allowed(before, honest.doc, 'writer')).toBe(true);
    expect(allowed(before, honest.doc, 'mallory')).toBe(false);
  });

  it('lets another writer suggest in the cells of a pending table, but no one change them directly', () => {
    const { after } = suggestedTable();
    const cell = holderOf(after.doc);
    let inCell = -1;
    after.doc.nodesBetween(cell.pos, cell.pos + cell.node.nodeSize, (node, pos) => {
      if (inCell < 0 && node.type.name === 'paragraph') inCell = pos + 1;
      return inCell < 0;
    });
    const typed = after.tr.insertText('Mine', inCell);
    expect(allowed(after, typed.doc, 'mallory')).toBe(false);
    const suggested = suggest(after, after.tr.insertText('Mine', inCell), 'mallory', 's0000002');
    expect(allowed(after, suggested.doc, 'mallory')).toBe(true);
    // Withdrawing the table now takes the other writer's suggestion: it needs the right to decide.
    const withdrawn = decided(suggested, rejectAllSuggestions).doc;
    expect(allowed(suggested, withdrawn, 'writer')).toBe(false);
    expect(allowed(suggested, withdrawn, 'writer', decider)).toBe(true);
    const row = holderOf(after.doc).node.lastChild?.firstChild;
    if (!row) throw new Error('No row.');
    const table =
      holderOf(after.doc).pos + 1 + (holderOf(after.doc).node.firstChild?.nodeSize ?? 0);
    const added = after.tr.insert(table + 1, row.type.create(null, row.content));
    // A row added is no suggestion, not even in the writer's own pending table.
    expect(allowed(after, added.doc, 'mallory')).toBe(false);
    expect(allowed(after, added.doc, 'writer')).toBe(false);
  });

  it('refuses a table attached to another writer’s suggestion', () => {
    const { after } = suggestedTable();
    const { node, pos } = holderOf(after.doc);
    const attached = after.tr.insert(
      pos + node.nodeSize,
      node.type.create({ ...node.attrs, dataAuthor: 'mallory' }, node.content),
    );
    expect(allowed(after, attached.doc, 'mallory')).toBe(false);
    const posing = after.tr.insert(pos + node.nodeSize, node);
    expect(allowed(after, posing.doc, 'mallory')).toBe(false);
  });

  it('refuses moving another writer’s whole-table deletion onto a table they did not choose', () => {
    const tableWith = (id: string, cell: string): StoredNode => ({
      ...TABLE,
      attrs: { id },
      content: [
        { type: 'caption', content: [text(id)] },
        { type: 'tableRow', content: [{ type: 'tableCell', content: [paragraph(cell)] }] },
      ],
    });
    const start = stateOf(paragraph('Intro'), tableWith('t1', 'One'), tableWith('t2', 'Two'));
    const holders: { node: Node; pos: number }[] = [];
    start.doc.descendants((node, pos) => {
      if (node.type.name === 'table_figure') holders.push({ node, pos });
      return node.type.name !== 'table_figure';
    });
    const [first, second] = holders;
    if (!first || !second) throw new Error('No tables.');
    // The owner's one suggestion deletes the first table whole and text in the second.
    const two = textAt(start.doc, 'Two');
    const both = start.tr.delete(two, two + 2).delete(first.pos, first.pos + first.node.nodeSize);
    const before = suggest(start, both, 'owner', 's0000005');
    const at = (index: number) => {
      const found: number[] = [];
      before.doc.descendants((node, pos) => {
        if (node.type.name === 'table_figure') found.push(pos);
        return node.type.name !== 'table_figure';
      });
      return found[index] ?? -1;
    };
    const moved = before.tr
      .setNodeAttribute(at(0), 'suggestionSplitKind', null)
      .setNodeAttribute(at(0), 'suggestionSplitId', null)
      .setNodeAttribute(at(1), 'suggestionSplitKind', 'deletion')
      .setNodeAttribute(at(1), 'suggestionSplitId', 's0000005');
    expect(allowed(before, moved.doc, 'writer', { ...decider, comment: false })).toBe(false);
  });
});
