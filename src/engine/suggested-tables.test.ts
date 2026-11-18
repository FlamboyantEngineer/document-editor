import type { Node } from 'prosemirror-model';
import { type Command, EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { writeMarkdown } from '../model/format/index.js';
import {
  type DocumentFile,
  joinFragments,
  readDocumentFile,
  type StoredNode,
  writeDocumentFile,
} from '../model/index.js';
import { createDocumentEditing } from './document-editing.js';
import { acceptAllSuggestions, rejectAllSuggestions } from './suggestion-decisions.js';
import { decideWithPolicy } from './suggestion-policy.js';
import { suggestionRefusalReason } from './suggestion-refusal.js';
import { suggestTransaction } from './suggestions.js';
import { insertTable } from './tables.js';
import { collectVersionBlocks } from './version-compare.js';

const text = (value: string) => ({ type: 'text', text: value });
const paragraph = (value: string): StoredNode =>
  value ? { type: 'paragraph', content: [text(value)] } : { type: 'paragraph' };
const table = (caption: string, cell: string): StoredNode => ({
  type: 'table',
  attrs: { id: 't0000001' },
  content: [
    { type: 'caption', content: caption ? [text(caption)] : [] },
    { type: 'tableRow', content: [{ type: 'tableCell', content: [paragraph(cell)] }] },
  ],
});

const fileOf = (...content: StoredNode[]): DocumentFile => ({
  formatVersion: 1,
  sections: [{ name: null, content }],
});

const stateOf = (...content: StoredNode[]) =>
  EditorState.create({
    doc: readDocumentFile(fileOf(...content), documentSchema).doc,
    plugins: createDocumentEditing(documentSchema),
  });

// The state with the caret in the paragraph that holds a text, or the first empty one.
function caretIn(state: EditorState, value: string): EditorState {
  let at = -1;
  state.doc.descendants((node, pos) => {
    const found = value ? node.textContent === value : !node.content.size;
    if (at < 0 && node.type.name === 'paragraph' && found) at = pos + 1;
    return at < 0;
  });
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, at)));
}

function holderOf(doc: Node): { node: Node; pos: number } | null {
  let found: { node: Node; pos: number } | null = null;
  doc.descendants((node, pos) => {
    if (!found && node.type.name === 'table_figure') found = { node, pos };
    return !found;
  });
  return found;
}

// The state after a command suggest mode rewrote, or null when it could not.
function suggested(state: EditorState, command: Command): EditorState | null {
  let after: EditorState | null = null;
  command(state, (tr) => {
    const rewritten = suggestTransaction(tr, state, { author: 'writer', newId: () => 's0000001' });
    after = rewritten && state.apply(rewritten);
  });
  return after;
}

const decided = (state: EditorState, command: Command) => {
  let next = state;
  command(state, (tr) => {
    next = state.apply(tr);
  });
  return next;
};

const blockNames = (state: EditorState) => {
  const names: string[] = [];
  state.doc.descendants((node) => {
    if (node.type.name === 'paragraph' || node.type.name === 'table_figure') {
      names.push(node.type.name === 'paragraph' ? `p:${node.textContent}` : 'table');
    }
    return node.type.name !== 'table_figure';
  });
  return names;
};

const SUGGESTED = { suggestionSplitKind: 'insertion', suggestionSplitId: 's0000001' };
const insert: Command = insertTable({ rows: 1, columns: 1 });

describe('a table suggested whole', () => {
  it('DOCE-SUGGESTIONS-1.4 suggests inserting a table, after a blank line it is put in', () => {
    for (const [start, blocks] of [
      [caretIn(stateOf(paragraph('Intro')), 'Intro'), ['p:Intro', 'table']],
      [caretIn(stateOf(paragraph('Intro'), paragraph('')), ''), ['p:Intro', 'p:', 'table']],
    ] as const) {
      const after = suggested(start, insert);
      if (!after) throw new Error('The table was not suggested.');
      expect(holderOf(after.doc)?.node.attrs).toMatchObject({ ...SUGGESTED, dataAuthor: 'writer' });
      expect(blockNames(after)).toEqual(blocks);
      expect(blockNames(decided(after, acceptAllSuggestions))).toEqual(blocks);
      expect(
        holderOf(decided(after, acceptAllSuggestions).doc)?.node.attrs.suggestionSplitKind,
      ).toBeNull();
      expect(blockNames(decided(after, rejectAllSuggestions))).toEqual(blocks.slice(0, -1));
    }
  });

  it('DOCE-SUGGESTIONS-1.4 suggests deleting a whole table as a block, its text marked with the same suggestion', () => {
    const before = stateOf(paragraph('Intro'), table('Limits', 'Cell'));
    const holder = holderOf(before.doc);
    if (!holder) throw new Error('No table.');
    const deleted = before.tr.delete(holder.pos, holder.pos + holder.node.nodeSize);
    const rewritten = suggestTransaction(deleted, before, { author: 'w', newId: () => 's1' });
    if (!rewritten) throw new Error('The deletion was not suggested.');
    const after = before.apply(rewritten);
    expect(holderOf(after.doc)?.node.attrs).toMatchObject({
      suggestionSplitKind: 'deletion',
      suggestionSplitId: 's1',
    });
    const marked: string[] = [];
    after.doc.descendants((node) => {
      const mark = node.marks.find((each) => each.type.name === 'deletion');
      if (node.isText && mark) marked.push(`${node.text ?? ''}:${String(mark.attrs.dataId)}`);
    });
    expect(marked).toEqual(['Limits:s1', 'Cell:s1']);
    expect(blockNames(decided(after, acceptAllSuggestions))).toEqual(['p:Intro']);
    expect(
      holderOf(decided(after, rejectAllSuggestions).doc)?.node.attrs.suggestionSplitKind,
    ).toBeNull();
  });

  it('DOCE-SUGGESTIONS-1.5 refuses deleting a whole table no text of which names the writer', () => {
    const before = stateOf(paragraph('Intro'), table('', ''));
    const holder = holderOf(before.doc);
    if (!holder) throw new Error('No table.');
    const deleted = before.tr.delete(holder.pos, holder.pos + holder.node.nodeSize);
    expect(suggestTransaction(deleted, before, { author: 'writer' })).toBeNull();
    expect(suggestionRefusalReason(deleted)).toBe('object');
  });

  it('DOCE-FORMAT-1.1 stores a table’s suggestion on the stored table, and reads it back to its holder', () => {
    const after = suggested(caretIn(stateOf(paragraph('Intro')), 'Intro'), insert);
    if (!after) throw new Error('The table was not suggested.');
    const stored = writeDocumentFile(after.doc).sections[0]?.content[1];
    expect(stored?.attrs).toMatchObject({
      author: 'writer',
      suggestionKind: 'insertion',
      suggestionId: 's0000001',
    });
    const read = readDocumentFile(writeDocumentFile(after.doc), documentSchema);
    expect(read.problems).toEqual([]);
    expect(holderOf(read.doc)?.node.attrs).toMatchObject({ ...SUGGESTED, dataAuthor: 'writer' });
    // The table's writer is its suggester's.
    expect(holderOf(read.doc)?.node.lastChild?.attrs.dataAuthor).toBe('writer');
    expect(writeDocumentFile(read.doc)).toEqual(writeDocumentFile(after.doc));
  });

  it('DOCE-PAGINATION-1.4 keeps a split table’s suggestion on each part and on the joined table', () => {
    const after = suggested(caretIn(stateOf(paragraph('Intro')), 'Intro'), insert);
    const holder = after && holderOf(after.doc)?.node;
    if (!holder?.firstChild || !holder.lastChild) throw new Error('No table.');
    const part = (index: number) =>
      holder.type.create({ ...holder.attrs, splitPartIndex: index }, [
        holder.firstChild ?? holder,
        holder.lastChild?.type.create(
          { ...holder.lastChild.attrs, splitPartIndex: index },
          holder.lastChild.content,
        ) ?? holder,
      ]);
    const [joined] = joinFragments([part(0), part(1)]);
    expect(joined?.attrs).toMatchObject({
      ...SUGGESTED,
      dataAuthor: 'writer',
      splitPartIndex: null,
    });
  });

  it('DOCE-FORMAT-4.3 DOCE-VERSIONS-1.6 leaves a suggested table out as its suggestion is decided', () => {
    const after = suggested(caretIn(stateOf(paragraph('Intro')), 'Intro'), insert);
    if (!after) throw new Error('The table was not suggested.');
    const file = writeDocumentFile(after.doc);
    expect(writeMarkdown(file, { suggestions: 'rejected' }).trim()).toBe('Intro');
    expect(writeMarkdown(file, { suggestions: 'accepted' })).toContain('|');
    const counted = (mode: 'accepted' | 'rejected') => collectVersionBlocks(after.doc, mode).length;
    expect(counted('accepted')).toBeGreaterThan(counted('rejected'));
    expect(counted('rejected')).toBe(1);
  });

  it('DOCE-SUGGESTIONS-2.8 keeps a writer from withdrawing a table another writer suggested text in', () => {
    const after = suggested(caretIn(stateOf(paragraph('Intro')), 'Intro'), insert);
    const holder = after && holderOf(after.doc);
    if (!after || !holder) throw new Error('The table was not suggested.');
    let cell = -1;
    after.doc.nodesBetween(holder.pos, holder.pos + holder.node.nodeSize, (node, pos) => {
      if (cell < 0 && node.type.name === 'paragraph') cell = pos + 1;
      return cell < 0;
    });
    const typed = suggestTransaction(after.tr.insertText('Mine', cell), after, {
      author: 'other',
      newId: () => 's0000002',
    });
    if (!typed) throw new Error('The text was not suggested.');
    const shared = after.apply(typed);
    const writer = { me: 'writer', canWithdraw: true, canDecide: false };
    expect(decideWithPolicy(writer, 'reject')(shared)).toBe(false);
    expect(decideWithPolicy(writer, 'reject')(after)).toBe(true);
    const withdrawn = decided(
      shared,
      decideWithPolicy({ me: 'reviewer', canDecide: true }, 'reject'),
    );
    expect(blockNames(withdrawn)).toEqual(['p:Intro']);
  });
});
