import { Slice } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import {
  BASE_TEMPLATE,
  readDocumentFile,
  type StoredNode,
  type TemplateFile,
} from '../model/index.js';
import { isReferencePlace, repairPastedReferences } from './reference-places.js';
import { touchesReferences } from './reference-updates.js';
import {
  createReferences,
  insertReference,
  listReferences,
  referenceTargets,
  refreshReferences,
} from './references.js';
import { markRemote } from './transaction-kind.js';

const text = (value: string): StoredNode => ({ type: 'text', text: value });
const paragraph = (value: string): StoredNode => ({ type: 'paragraph', content: [text(value)] });
const heading = (id: string, value: string): StoredNode => ({
  type: 'heading',
  attrs: { id, level: 1 },
  content: [text(value)],
});
const cell = (type: 'tableCell' | 'tableHeader', value: string): StoredNode => ({
  type,
  content: [paragraph(value)],
});

const TEMPLATE: TemplateFile = {
  ...BASE_TEMPLATE,
  references: { formats: { 'internal-heading': 'section {{ref.numbering}} {{ref.title}}' } },
};

function stateOf(content: StoredNode[], template: () => TemplateFile = () => TEMPLATE) {
  const doc = readDocumentFile(
    { formatVersion: 1, sections: [{ name: null, content }] },
    documentSchema,
  );
  return EditorState.create({ doc, plugins: [createReferences({ template })] });
}

// The position of the first text holding a value.
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

const placeAt = (state: EditorState, value: string) =>
  isReferencePlace(state.doc.resolve(posOf(state, value)));

const at = (state: EditorState, value: string) =>
  state.apply(state.tr.setSelection(TextSelection.create(state.doc, posOf(state, value))));

// A state whose paragraph `See .` cites the heading `Power` at its full stop.
function citing(content: StoredNode[]) {
  let state = stateOf([heading('h0000001', 'Power'), ...content]);
  const [power] = referenceTargets(state.doc, TEMPLATE);
  if (!power) throw new Error('The document has a heading');
  state = at(state, '.');
  insertReference({ kind: 'internal', target: power, text: 'x' })(state, (tr) => {
    state = state.apply(tr);
  });
  return state;
}

const textOf = (state: EditorState) => state.doc.textBetween(0, state.doc.content.size, '|');

describe('reference places', () => {
  it('DOCE-REFERENCES-1.6 takes references in body text only', () => {
    const state = stateOf([
      heading('h0000001', 'Title'),
      paragraph('Body'),
      { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph('Item')] }] },
      { type: 'blockquote', content: [paragraph('Quoted')] },
      {
        type: 'table',
        content: [
          { type: 'tableRow', content: [cell('tableHeader', 'Head')] },
          { type: 'tableRow', content: [cell('tableCell', 'Cell')] },
        ],
      },
      { type: 'codeBlock', content: [text('x = 1')] },
      { type: 'script', content: [paragraph('Output')] },
    ]);
    const places = ['Title', 'Body', 'Item', 'Quoted', 'Head', 'Cell', 'x = 1', 'Output'].map(
      (value) => [value, placeAt(state, value)],
    );
    expect(Object.fromEntries(places)).toEqual({
      Title: false,
      Body: true,
      Item: true,
      Quoted: true,
      Head: false,
      Cell: true,
      'x = 1': false,
      Output: false,
    });
  });

  it('DOCE-REFERENCES-1.6 never grows a heading that cites itself', () => {
    let state = stateOf([heading('h0000001', 'Power ')]);
    const [power] = referenceTargets(state.doc, TEMPLATE);
    if (!power) throw new Error('The document has a heading');
    // A stored document may hold one: the reference is left as it reads.
    const end = posOf(state, 'Power') + 'Power '.length;
    const mark = documentSchema.marks.reference?.create({
      refType: 'internal-heading',
      targetId: 'h0000001',
    });
    if (!mark) throw new Error('The schema has references');
    state = state.apply(state.tr.insertText('x', end).addMark(end, end + 1, mark));
    for (let index = 0; index < 3; index += 1) {
      state = state.apply(state.tr.insertText('!', posOf(state, 'Power')));
    }
    expect(textOf(state)).toBe('!!!Power x');
  });

  it('DOCE-REFERENCES-1.6 takes pasted references off text that lands where none may go', () => {
    const state = citing([paragraph('See .'), heading('h0000002', 'Into')]);
    const [reference] = listReferences(state.doc);
    if (!reference) throw new Error('The paragraph cites the heading');
    const slice = state.doc.slice(reference.from - 4, reference.to);
    const inBody = repairPastedReferences(slice, at(state, 'See'));
    expect(inBody.eq(slice)).toBe(true);
    const inHeading = repairPastedReferences(slice, at(state, 'Into'));
    let marked = false;
    inHeading.content.descendants((node) => {
      if (node.marks.some((each) => each.type.name === 'reference')) marked = true;
    });
    expect(marked).toBe(false);
    expect(inHeading.content.textBetween(0, inHeading.content.size)).toBe(
      slice.content.textBetween(0, slice.content.size),
    );
    expect(repairPastedReferences(Slice.empty, state)).toBe(Slice.empty);
  });
});

describe('reference updates', () => {
  it('DOCE-REFERENCES-1.7 walks no reference for typing in body text', () => {
    const state = citing([paragraph('See .'), paragraph('Other')]);
    const typing = state.tr.insertText('more ', posOf(state, 'Other'));
    expect(touchesReferences(typing)).toBe(false);
    const walk = vi.spyOn(Object.getPrototypeOf(state.doc) as typeof state.doc, 'descendants');
    state.apply(typing);
    expect(walk).not.toHaveBeenCalled();
    expect(touchesReferences(state.tr.insertText('Supply ', posOf(state, 'Power')))).toBe(true);
    const [reference] = listReferences(state.doc);
    if (!reference) throw new Error('The paragraph cites the heading');
    expect(touchesReferences(state.tr.insertText('y', reference.from + 1))).toBe(true);
    expect(touchesReferences(state.tr.split(posOf(state, 'Other')))).toBe(true);
  });

  it('DOCE-REFERENCES-1.7 leaves a remote change to the sender, which brought its updates', () => {
    let state = citing([paragraph('See .')]);
    const before = textOf(state);
    state = state.apply(markRemote(state.tr.insertText('Supply ', posOf(state, 'Power'))));
    expect(textOf(state)).toBe(before.replace('Power', 'Supply Power'));
  });

  it('DOCE-REFERENCES-1.8 records its target and renders again when asked', () => {
    let state = citing([paragraph('See .')]);
    const [reference] = listReferences(state.doc);
    expect(JSON.parse(String(reference?.mark.attrs.referenceBaseline))).toMatchObject({
      numbering: '1.',
      title: 'Power',
      defaultLabel: '1. Power',
    });
    expect(refreshReferences(TEMPLATE)(state)).toBe(false);
    const changed = {
      ...TEMPLATE,
      references: { formats: { 'internal-heading': '{{ref.title}}' } },
    };
    refreshReferences(changed)(state, (tr) => {
      state = state.apply(tr);
    });
    expect(textOf(state)).toBe('Power|See Power.');
  });
});
