import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import {
  abbreviationIssueAt,
  abbreviationIssues,
  createAbbreviationHealth,
  recordGlossaryEntries,
} from './abbreviation-health.js';
import { type AbbreviationEntry, insertAbbreviation, unlinkAbbreviation } from './abbreviations.js';

const GSE = { id: 'g1', abbreviation: 'GSE', expansion: 'Ground support equipment' };
const OTHER_GSE = { id: 'g2', abbreviation: 'gse', expansion: 'General system element' };
const PDU = { id: 'g3', abbreviation: 'PDU', expansion: 'Power distribution unit' };

const glossary = { resolve: () => Promise.resolve({ ok: true as const, value: [] }) };

function stateOf(content: StoredNode[]) {
  const doc = readDocumentFile(
    { formatVersion: 1, sections: [{ name: null, content }] },
    documentSchema,
  );
  return EditorState.create({ doc, plugins: [createAbbreviationHealth({ glossary })] });
}

function posOf(state: EditorState, value: string): number {
  let found = -1;
  state.doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text?.includes(value)) {
      found = pos + (node.text.indexOf(value) ?? 0);
    }
    return found < 0;
  });
  if (found < 0) throw new Error(`The document holds ${value}`);
  return found;
}

// Inserts an abbreviation of each entry at the marker, in turn.
function citing(entries: readonly AbbreviationEntry[]) {
  let state = stateOf([{ type: 'paragraph', content: [{ type: 'text', text: 'Use # here.' }] }]);
  for (const entry of entries) {
    const at = posOf(state, '#');
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, at, at + 1)));
    insertAbbreviation(entry)(state, (tr) => {
      state = state.apply(tr);
    });
    state = state.apply(state.tr.insertText(' # ', state.selection.to));
  }
  return state;
}

const atoms = (state: EditorState) => {
  const found: number[] = [];
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'abbreviation_reference') found.push(pos);
  });
  return found;
};

const select = (state: EditorState, pos: number) =>
  state.apply(state.tr.setSelection(NodeSelection.create(state.doc, pos)));

describe('abbreviation health', () => {
  it('DOCE-REFERENCES-2.3 marks abbreviations whose entry is missing, archived or read twice', () => {
    const state = citing([GSE, OTHER_GSE, PDU]);
    const archived = { ...PDU, archivedAt: '2026-01-01T00:00:00Z' };
    const answer = new Map([
      ['g1', { ...GSE, archivedAt: null }],
      ['g2', { ...OTHER_GSE, archivedAt: null }],
      ['g3', archived],
    ]);
    expect(abbreviationIssues(state.doc, answer).map((each) => each.issue)).toEqual([
      'duplicate',
      'duplicate',
      'archived',
    ]);
    expect(abbreviationIssues(state.doc, new Map([['g1', null]]))).toEqual([
      { pos: atoms(state)[0], entryId: 'g1', issue: 'missing' },
    ]);
  });

  it('DOCE-REFERENCES-2.3 decorates the abbreviations as the glossary answers', () => {
    let state = citing([GSE, PDU]);
    recordGlossaryEntries(['g1', 'g3'], [{ ...GSE, archivedAt: null }])(state, (tr) => {
      state = state.apply(tr);
    });
    const [first, second] = atoms(state);
    if (first === undefined || second === undefined) throw new Error('Two abbreviations');
    expect(abbreviationIssueAt(select(state, first))).toBeNull();
    expect(abbreviationIssueAt(select(state, second))).toBe('missing');
    const view = new EditorView(document.createElement('div'), { state });
    const marked = view.dom.querySelectorAll('[data-abbreviation-issue]');
    expect([...marked].map((each) => each.getAttribute('data-abbreviation-issue'))).toEqual([
      'missing',
    ]);
    view.destroy();
  });

  it('DOCE-REFERENCES-2.1 keeps the marks of the text it replaces, and gives them back', () => {
    let state = stateOf([
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'GSE', marks: [{ type: 'bold' }] }],
      },
    ]);
    const at = posOf(state, 'GSE');
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, at, at + 3)));
    insertAbbreviation(GSE, 'short')(state, (tr) => {
      state = state.apply(tr);
    });
    const [pos] = atoms(state);
    if (pos === undefined) throw new Error('An abbreviation');
    expect(state.doc.nodeAt(pos)?.marks.map((mark) => mark.type.name)).toEqual(['strong']);
    unlinkAbbreviation(state, (tr) => {
      state = state.apply(tr);
    });
    const text = state.doc.nodeAt(posOf(state, 'GSE'));
    expect(text?.marks.map((mark) => mark.type.name)).toEqual(['strong']);
  });
});
