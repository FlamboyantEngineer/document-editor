import { type Command, EditorState, type NodeSelection, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import {
  BASE_TEMPLATE,
  readDocumentFile,
  type StoredNode,
  type TemplateFile,
} from '../model/index.js';
import {
  documentAbbreviations,
  insertAbbreviation,
  refreshAbbreviations,
  setAbbreviationDisplay,
  unlinkAbbreviation,
} from './abbreviations.js';
import {
  citationKey,
  createReferenceStatus,
  referenceStatusAt,
  refreshReferenceStatus,
  resolveCitations,
  updateReference,
} from './reference-status.js';
import {
  canInsertReference,
  createReferences,
  insertReference,
  listReferences,
  referenceAt,
  referenceTargets,
  removeReference,
} from './references.js';

const text = (value: string): StoredNode => ({ type: 'text', text: value });
const heading = (id: string, value: string): StoredNode => ({
  type: 'heading',
  attrs: { id, level: 1 },
  content: [text(value)],
});
const paragraph = (value: string): StoredNode => ({ type: 'paragraph', content: [text(value)] });

const TEMPLATE: TemplateFile = {
  ...BASE_TEMPLATE,
  references: { formats: { 'internal-heading': 'section {{ref.numbering}} {{ref.title}}' } },
};

function stateOf(...content: StoredNode[]) {
  const doc = readDocumentFile(
    { formatVersion: 1, sections: [{ name: null, content }] },
    documentSchema,
  ).doc;
  return EditorState.create({ doc, plugins: [createReferences({ template: () => TEMPLATE })] });
}

function at(state: EditorState, value: string, length = 0) {
  let found = -1;
  state.doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text?.includes(value)) {
      found = pos + (node.text.indexOf(value) ?? 0);
    }
    return found < 0;
  });
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, found, found + length)));
}

function run(state: EditorState, command: Command): EditorState {
  let next = state;
  expect(command(state, (tr) => (next = next.applyTransaction(tr).state))).toBe(true);
  return next;
}

const referenceTexts = (state: EditorState) =>
  listReferences(state.doc).map((each) => ({
    text: state.doc.textBetween(each.from, each.to),
    broken: each.mark.attrs.broken as boolean,
  }));

describe('references', () => {
  it('DOCE-REFERENCES-1.1 lists the targets with their numbers and labels', () => {
    const state = stateOf(heading('h0000001', 'Scope'), heading('h0000002', 'Power'));
    expect(
      referenceTargets(state.doc, TEMPLATE).map(({ id, kind, label }) => [id, kind, label]),
    ).toEqual([
      ['h0000001', 'heading', '1. Scope'],
      ['h0000002', 'heading', '2. Power'],
    ]);
  });

  it('DOCE-REFERENCES-1.2 DOCE-REFERENCES-1.6 inserts a reference as the template formats it, where one may go', () => {
    let state = stateOf(
      heading('h0000001', 'Scope'),
      heading('h0000002', 'Power'),
      paragraph('See .'),
    );
    const [, power] = referenceTargets(state.doc, TEMPLATE);
    if (!power) throw new Error('The document has two headings');
    state = at(state, '.');
    state = run(
      state,
      insertReference({ kind: 'internal', target: power, text: 'section 2. Power' }),
    );
    expect(referenceTexts(state)).toEqual([{ text: 'section 2. Power', broken: false }]);
    expect(referenceAt(at(state, '2. Power', 2))?.mark.attrs.targetId).toBe('h0000002');
    expect(canInsertReference(at(state, 'See'))).toBe(true);
    // DOCE-REFERENCES-1.6: a heading takes none.
    expect(canInsertReference(at(state, 'Scope'))).toBe(false);
    const code = stateOf({ type: 'codeBlock', content: [text('x = 1')] });
    expect(canInsertReference(at(code, 'x'))).toBe(false);
  });

  it('DOCE-REFERENCES-1.3 follows its target, and is marked broken when the target is gone', () => {
    let state = stateOf(
      heading('h0000001', 'Scope'),
      heading('h0000002', 'Power'),
      paragraph('See .'),
    );
    const [, power] = referenceTargets(state.doc, TEMPLATE);
    if (!power) throw new Error('The document has two headings');
    state = run(at(state, '.'), insertReference({ kind: 'internal', target: power, text: 'x' }));
    // The plugin brings the text in line at once.
    state = state.apply(
      state.tr.insertText('Supply ', (referenceTargets(state.doc, TEMPLATE)[1]?.pos ?? 0) + 1),
    );
    expect(referenceTexts(state)).toEqual([{ text: 'section 2. Supply Power', broken: false }]);
    const target = referenceTargets(state.doc, TEMPLATE)[1];
    if (!target) throw new Error('The heading is there');
    const node = state.doc.nodeAt(target.pos);
    state = state.apply(state.tr.delete(target.pos, target.pos + (node?.nodeSize ?? 0)));
    expect(referenceTexts(state)).toEqual([{ text: 'section 2. Supply Power', broken: true }]);
  });

  it('DOCE-REFERENCES-1.4 removes a reference, keeping its text', () => {
    let state = stateOf(heading('h0000001', 'Scope'), paragraph('See .'));
    const [scope] = referenceTargets(state.doc, TEMPLATE);
    if (!scope) throw new Error('The document has a heading');
    state = run(at(state, '.'), insertReference({ kind: 'internal', target: scope, text: 'x' }));
    state = run(at(state, '1.', 1), removeReference);
    expect(listReferences(state.doc)).toHaveLength(0);
    expect(state.doc.textBetween(0, state.doc.content.size)).toContain('section 1. Scope');
  });
});

describe('abbreviations', () => {
  const entry = { id: 'g1', abbreviation: 'GSE', expansion: 'Ground support equipment' };
  const selected = (state: EditorState) => (state.selection as NodeSelection).node;

  it('DOCE-REFERENCES-2.1 inserts an abbreviation, switches its form and turns it into text', () => {
    let state = run(at(stateOf(paragraph('Use the  here.')), ' here'), insertAbbreviation(entry));
    expect(selected(state).attrs).toMatchObject({ entryId: 'g1', display: 'full', abbr: 'GSE' });
    state = run(state, setAbbreviationDisplay());
    expect(selected(state).attrs.display).toBe('short');
    state = run(state, unlinkAbbreviation);
    expect(state.doc.textBetween(0, state.doc.content.size)).toContain('Use the GSE here.');
  });

  it('DOCE-REFERENCES-2.2 refreshes the abbreviations from the glossary', () => {
    let state = run(at(stateOf(paragraph('Use the  here.')), ' here'), insertAbbreviation(entry));
    state = run(state, refreshAbbreviations([{ ...entry, expansion: 'Ground service equipment' }]));
    expect(documentAbbreviations(state.doc)).toEqual([
      { id: 'g1', abbreviation: 'GSE', expansion: 'Ground service equipment' },
    ]);
    expect(refreshAbbreviations([{ ...entry, expansion: 'Ground service equipment' }])(state)).toBe(
      false,
    );
  });
});

describe('external references', () => {
  const baseline = (revisionLabel: string) => ({
    version: 1 as const,
    documentId: 'pwr-100',
    numbering: 'PWR-100',
    title: 'Power interface',
    revision: null,
    revisionLabel,
    target: null,
    defaultLabel: `PWR-100 ${revisionLabel}`,
  });

  it('DOCE-REFERENCES-1.5 marks a citation unavailable or updated, and takes its update', () => {
    const doc = readDocumentFile(
      { formatVersion: 1, sections: [{ name: null, content: [paragraph('See .')] }] },
      documentSchema,
    ).doc;
    const source = { search: () => Promise.resolve({ ok: true as const, value: [] }) };
    let state = EditorState.create({ doc, plugins: [createReferenceStatus({ source })] });
    state = at(state, '.');
    state = run(
      state,
      insertReference({
        kind: 'external',
        refType: 'external-document',
        baseline: baseline('A'),
        text: 'PWR-100 A',
      }),
    );
    state = at(state, 'PWR-100', 3);
    const key = citationKey({ documentId: 'pwr-100', targetId: null });
    state = run(state, resolveCitations(new Map([[key, baseline('B')]])));
    expect(referenceStatusAt(state)).toBe('update');
    state = run(state, updateReference);
    expect(state.doc.textBetween(0, state.doc.content.size)).toContain('See PWR-100 B.');
    expect(referenceStatusAt(at(state, 'PWR-100', 3))).toBe('current');
    state = run(state, resolveCitations(new Map([[key, null]])));
    expect(referenceStatusAt(at(state, 'PWR-100', 3))).toBe('unavailable');
    expect(updateReference(at(state, 'PWR-100', 3))).toBe(false);
  });

  it('DOCE-REFERENCES-1.9 marks a citation out of reach, asks again, and moves to a new target', () => {
    const target = {
      id: 't1',
      kind: 'heading',
      stable: true,
      numbering: '2',
      title: 'Bus',
      label: '2 Bus',
    };
    const doc = readDocumentFile(
      { formatVersion: 1, sections: [{ name: null, content: [paragraph('See .')] }] },
      documentSchema,
    ).doc;
    const source = { search: () => Promise.resolve({ ok: true as const, value: [] }) };
    let state = EditorState.create({ doc, plugins: [createReferenceStatus({ source })] });
    const cited = { ...baseline('A'), target };
    state = run(
      at(state, '.'),
      insertReference({
        kind: 'external',
        refType: 'external-document',
        baseline: cited,
        text: 'Bus',
      }),
    );
    state = at(state, 'Bus', 2);
    const key = citationKey({ documentId: 'pwr-100', targetId: 't1' });
    state = run(state, resolveCitations(new Map([[key, 'no-access']])));
    expect(referenceStatusAt(state)).toBe('no-access');
    expect(updateReference(state)).toBe(false);
    // The host asks again: nothing is known until it answers.
    state = run(state, refreshReferenceStatus);
    expect(referenceStatusAt(state)).toBeNull();
    const moved = { ...baseline('B'), target: { ...target, id: 't2', title: 'Power bus' } };
    state = run(state, resolveCitations(new Map([[key, moved]])));
    expect(referenceStatusAt(state)).toBe('update');
    state = run(state, updateReference);
    expect(referenceAt(at(state, 'PWR-100', 2))?.mark.attrs.targetId).toBe('t2');
  });
});
