import { Fragment, Slice } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { caretAt, footnoteState, note, paragraph, text } from '../../test/footnote-fixtures.js';
import { flattenFootnotePaste } from './footnote-paste.js';

const { nodes } = documentSchema;

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
    expect(markers(flattenFootnotePaste(copied(), caretAt(heading, 'Title')))).toBe(0);
    const marker = nodes.footnote_reference?.create({ footnoteId: 'n9' });
    const cell = nodes.table_header?.create(null, nodes.paragraph?.create(null, marker));
    const row = nodes.table_row?.create(null, cell);
    const table = nodes.table?.create(null, row);
    if (!table) throw new Error('No table');
    const body = caretAt(footnoteState([paragraph(text('Body'))]), 'Body');
    expect(markers(flattenFootnotePaste(new Slice(Fragment.from(table), 0, 0), body))).toBe(0);
  });
});
