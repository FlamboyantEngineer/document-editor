import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import {
  caretAt,
  footnoteParts,
  footnoteState,
  note,
  paragraph,
  runCommand,
  text,
  textPos,
} from '../../test/footnote-fixtures.js';
import { projectDocument, readDocumentFile } from '../model/index.js';
import {
  createFootnoteNumbers,
  type FootnoteNumbering,
  numberFootnoteParts,
  renumberFootnotes,
} from './footnote-numbers.js';
import { insertFootnote } from './footnotes.js';
import { markRemote } from './transaction-kind.js';

// Two sections, the first citing two footnotes and the second one.
const twoSections = () =>
  readDocumentFile(
    {
      formatVersion: 1,
      sections: [
        {
          name: null,
          content: [
            paragraph(text('One'), note('a', 'A')),
            paragraph(text('Two'), note('b', 'B'), text(' again')),
          ],
        },
        { name: null, content: [paragraph(text('Three'), note('c', 'C'))] },
      ],
    },
    documentSchema,
  ).doc;

// Each part's kind, footnote and number, in document order.
const numbered = (doc: ProseMirrorNode, numbering: FootnoteNumbering) =>
  numberFootnoteParts(doc, numbering).map(
    ({ node, number }) =>
      `${node.type.name === 'footnote_entry' ? 'entry' : 'marker'}:${String(node.attrs.footnoteId)}:${String(number)}`,
  );

// The first section's two paragraphs on two pages, as a layout would place them.
function onTwoPages(doc: ProseMirrorNode, numbering: 'document' | 'page') {
  const blocks: ProseMirrorNode[] = [];
  doc.firstChild?.firstChild?.forEach((region) => {
    if (region.type.name === 'page_content') region.forEach((block) => blocks.push(block));
  });
  const [first, second] = blocks;
  if (!first || !second) throw new Error('Two paragraphs were expected.');
  return projectDocument(doc, [[[first], [second]]], { footnoteNumbering: numbering });
}

describe('footnote numbers', () => {
  it('DOCE-FOOTNOTES-2.1 numbers through the document, in each section, or on each page', () => {
    const doc = twoSections();
    expect(numbered(doc, 'document')).toEqual([
      'marker:a:1',
      'marker:b:2',
      'entry:a:1',
      'entry:b:2',
      'marker:c:3',
      'entry:c:3',
    ]);
    expect(numbered(doc, 'section').slice(4)).toEqual(['marker:c:1', 'entry:c:1']);
    // On pages each page starts again, with the entries of the footnotes it cites.
    expect(numbered(onTwoPages(doc, 'page'), 'page')).toEqual([
      'marker:a:1',
      'entry:a:1',
      'marker:b:1',
      'entry:b:1',
      'marker:c:1',
      'entry:c:1',
    ]);
    // Through the document, each entry on the page citing it.
    expect(numbered(onTwoPages(doc, 'document'), 'document')).toEqual([
      'marker:a:1',
      'entry:a:1',
      'marker:b:2',
      'entry:b:2',
      'marker:c:3',
      'entry:c:3',
    ]);
  });

  it('DOCE-FOOTNOTES-2.2 draws numbers that no transaction writes', () => {
    let state = footnoteState([paragraph(text('Before after.'), note('n1', 'Old'))]);
    state = runCommand(caretAt(state, 'after', -1), insertFootnote({ newId: () => 'n0' }));
    expect(footnoteParts(state, 'number')).toEqual([
      'marker:1',
      'marker:2',
      'entry:1:',
      'entry:2:Old',
    ]);
    expect(JSON.stringify(state.doc.toJSON())).not.toMatch(/footnoteNumber/);
    for (const type of ['footnote_reference', 'footnote_entry'])
      expect(Object.keys(documentSchema.nodes[type]?.spec.attrs ?? {})).not.toContain(
        'footnoteNumber',
      );
  });

  it('DOCE-FOOTNOTES-2.2 maps the numbers through typing and counts them again after other changes', () => {
    const state = EditorState.create({ doc: twoSections(), plugins: [createFootnoteNumbers()] });
    const typed = state.apply(state.tr.insertText('Typed ', textPos(state, 'One')));
    expect(footnoteParts(typed, 'number')).toEqual(footnoteParts(state, 'number'));
    // A remote change is numbered here as a local one: footnote b's marker deleted elsewhere.
    const b = textPos(state, ' again') - 1;
    const deleted = state.apply(markRemote(state.tr.delete(b, b + 1)));
    expect(footnoteParts(deleted, 'number')).toEqual([
      'marker:1',
      'entry:1:A',
      'entry:null:B',
      'marker:2',
      'entry:2:C',
    ]);
  });

  it('DOCE-FOOTNOTES-2.2 numbers by the numbering a transaction sets, from then on', () => {
    let state = EditorState.create({ doc: twoSections(), plugins: [createFootnoteNumbers()] });
    expect(footnoteParts(state, 'number').slice(4)).toEqual(['marker:3', 'entry:3:C']);
    state = state.apply(renumberFootnotes(state.tr, 'section'));
    expect(footnoteParts(state, 'number').slice(4)).toEqual(['marker:1', 'entry:1:C']);
    state = state.apply(state.tr.split(textPos(state, 'Three')));
    expect(footnoteParts(state, 'number').slice(4)).toEqual(['marker:1', 'entry:1:C']);
    state = state.apply(renumberFootnotes(state.tr, null));
    expect(footnoteParts(state, 'number').slice(4)).toEqual(['marker:null', 'entry:null:C']);
  });

  it('DOCE-FOOTNOTES-2.2 shows the number as text, with its hook and tooltip', () => {
    const state = EditorState.create({ doc: twoSections(), plugins: [createFootnoteNumbers()] });
    const view = new EditorView(document.createElement('div'), { state });
    const markers = [...view.dom.querySelectorAll('[data-footnote-reference]')];
    expect(markers.map((marker) => marker.textContent)).toEqual(['1', '2', '3']);
    expect(markers.map((marker) => marker.getAttribute('data-footnote-number'))).toEqual([
      '1',
      '2',
      '3',
    ]);
    expect(markers[1]?.getAttribute('title')).toBe('Footnote 2');
    const numbers = [...view.dom.querySelectorAll('.pm-footnote-entry-number')];
    expect(numbers.map((number) => number.textContent)).toEqual(['1', '2', '3']);
    view.dispatch(renumberFootnotes(view.state.tr, 'section'));
    expect(view.dom.querySelectorAll('.pm-footnote-entry-number')[2]?.textContent).toBe('1');
    expect(
      view.dom.querySelectorAll('[data-footnote-entry]')[2]?.getAttribute('data-footnote-number'),
    ).toBe('1');
    view.destroy();
  });
});
