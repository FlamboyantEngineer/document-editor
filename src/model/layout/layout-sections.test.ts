import { Fragment } from 'prosemirror-model';
import { Transform } from 'prosemirror-transform';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import {
  countWords,
  needsLayoutSections,
  readDocumentFile,
  readingMinutes,
  type StoredNode,
  unwrapLayoutSections,
  wrapInLayoutSections,
} from '../index.js';

const paragraph = (text: string): StoredNode => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});
const columns = (preset: string, ...texts: string[]): StoredNode => ({
  type: 'columns',
  attrs: { preset },
  content: texts.map((text) => ({ type: 'column', content: [paragraph(text)] })),
});
const read = (...content: StoredNode[]) =>
  readDocumentFile({ formatVersion: 1, sections: [{ name: null, content }] }, documentSchema);

// The page content's top-level blocks: a section as its preset and columns' text, a block as its text.
const outline = (doc: ReturnType<typeof read>) =>
  doc
    .child(0)
    .child(0)
    .child(1)
    .children.map((block) =>
      block.type.name === 'layout_section'
        ? `${String(block.attrs.preset)}[${block.children.map((column) => column.textContent).join('|')}]`
        : block.textContent,
    );

describe('layout sections', () => {
  it('DOCE-LAYOUT-1.1 wraps each run of blocks outside a section in a one-column section', () => {
    const doc = read(paragraph('A'), paragraph('B'), columns('halves', 'C', 'D'), paragraph('E'));
    expect(needsLayoutSections(doc)).toBe(true);
    const tr = new Transform(doc);
    expect(wrapInLayoutSections(tr)).toBe(true);
    expect(outline(tr.doc)).toEqual(['single[AB]', 'halves[C|D]', 'single[E]']);
    expect(needsLayoutSections(tr.doc)).toBe(false);
    expect(wrapInLayoutSections(new Transform(tr.doc))).toBe(false);
  });

  it('DOCE-LAYOUT-1.2 gives content without a section an empty one', () => {
    const doc = read();
    const tr = new Transform(doc);
    wrapInLayoutSections(tr);
    expect(outline(tr.doc)).toEqual(['single[]']);
  });

  it("DOCE-LAYOUT-1.3 unwraps sections into their columns' content", () => {
    const doc = read(columns('thirds', 'A', 'B', 'C'), paragraph('D'));
    const content = unwrapLayoutSections(doc.child(0).child(0).child(1).content);
    expect(content.childCount).toBe(4);
    expect(content.textBetween(0, content.size, '|')).toBe('A|B|C|D');
    const plain = Fragment.from(documentSchema.text('x'));
    expect(unwrapLayoutSections(plain)).toBe(plain);
  });

  it('DOCE-LAYOUT-3.1 counts the words of the content and the minutes they take to read', () => {
    const doc = read(paragraph('Three short words'), columns('halves', 'one', 'two more'));
    expect(countWords(doc)).toBe(6);
    expect(readingMinutes(0)).toBe(1);
    expect(readingMinutes(201)).toBe(2);
    expect(readingMinutes(400)).toBe(2);
  });
});
