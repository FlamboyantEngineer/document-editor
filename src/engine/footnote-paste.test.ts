import { Fragment, Slice } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { caretAt, footnoteState, note, paragraph, text } from '../../test/footnote-fixtures.js';
import { flattenFootnotePaste } from './footnote-paste.js';

const { nodes } = documentSchema;
const schemaText = (value: string) => documentSchema.text(value);

// Two paragraphs and a list, the first paragraph citing a footnote, as copied from the body.
function copied() {
  const source = footnoteState([
    paragraph(text('Alpha', [{ type: 'strong' }]), note('n9', 'Cited')),
    { type: 'heading', attrs: { level: 2 }, content: [text('Beta')] },
  ]);
  const content = source.doc.nodeAt(0)?.firstChild?.child(1);
  if (!content) throw new Error('No page content');
  return new Slice(content.content, 0, 0);
}

const markers = (slice: Slice) => {
  let count = 0;
  slice.content.descendants((node) => {
    if (node.type.name === 'footnote_reference') count += 1;
  });
  return count;
};

describe('pasting where footnotes have rules', () => {
  it('DOCE-FOOTNOTES-1.6 flattens what is pasted into an entry to one run of text', () => {
    const state = caretAt(footnoteState([paragraph(text('Body'), note('n1', 'Note'))]), 'Note');
    const flat = flattenFootnotePaste(copied(), state);
    expect(flat.openStart).toBe(0);
    expect(flat.content.childCount).toBe(2);
    expect(flat.content.textBetween(0, flat.content.size)).toBe('Alpha Beta');
    expect(flat.content.firstChild?.marks.map((mark) => mark.type.name)).toEqual(['strong']);
    expect(markers(flat)).toBe(0);
  });

  it('DOCE-FOOTNOTES-1.6 keeps markers pasted into a paragraph that may cite them', () => {
    const state = caretAt(footnoteState([paragraph(text('Body'))]), 'Body');
    const slice = copied();
    expect(flattenFootnotePaste(slice, state)).toBe(slice);
  });

  it('DOCE-FOOTNOTES-1.6 drops markers pasted where no footnote may be cited', () => {
    const heading = footnoteState([
      { type: 'heading', attrs: { level: 1 }, content: [text('Title')] },
    ]);
    const joining = new Slice(copied().content, 1, 1);
    expect(markers(flattenFootnotePaste(joining, caretAt(heading, 'Title')))).toBe(0);
    const marker = nodes.footnote_reference?.create({ footnoteId: 'n9' });
    const inline = new Slice(Fragment.from(marker), 0, 0);
    expect(markers(flattenFootnotePaste(inline, caretAt(heading, 'Title')))).toBe(0);
    const cell = nodes.table_header?.create(null, nodes.paragraph?.create(null, marker));
    const row = nodes.table_row?.create(null, cell);
    const table = nodes.table?.create(null, row);
    if (!table) throw new Error('No table');
    const body = caretAt(footnoteState([paragraph(text('Body'))]), 'Body');
    expect(markers(flattenFootnotePaste(new Slice(Fragment.from(table), 0, 0), body))).toBe(0);
  });

  it('DOCE-FOOTNOTES-1.6 keeps the markers of whole paragraphs pasted with the caret in a heading', () => {
    const heading = caretAt(
      footnoteState([{ type: 'heading', attrs: { level: 1 }, content: [text('Title')] }]),
      'Title',
    );
    const whole = copied();
    expect(flattenFootnotePaste(whole, heading)).toBe(whole);
    const second = footnoteState([
      paragraph(text('Joins')),
      paragraph(text('Lands'), note('n8', 'Cited')),
    ]);
    const content = second.doc.nodeAt(0)?.firstChild?.child(1);
    if (!content) throw new Error('No page content');
    const open = new Slice(content.content, 1, 1);
    expect(flattenFootnotePaste(open, heading)).toBe(open);
  });

  it('DOCE-FOOTNOTES-1.6 drops the markers of whole paragraphs that land where none may be cited', () => {
    const header = nodes.table_header?.create(
      null,
      nodes.paragraph?.create(null, schemaText('Head')),
    );
    const table = nodes.table?.create(null, nodes.table_row?.create(null, header));
    if (!table) throw new Error('No table');
    const source = footnoteState([paragraph(text('Body'))]);
    const withTable = source.apply(source.tr.insert(source.selection.from - 1, table));
    expect(markers(flattenFootnotePaste(copied(), caretAt(withTable, 'Head')))).toBe(0);
  });
});
