import { Transform } from 'prosemirror-transform';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import {
  BASE_TEMPLATE,
  readDocumentFile,
  setPageRegions,
  type StoredNode,
  type TemplateFile,
} from '../index.js';

const paragraph = (...content: StoredNode[]): StoredNode => ({ type: 'paragraph', content });
const text = (value: string): StoredNode => ({ type: 'text', text: value });
const variable = (key: string): StoredNode => ({ type: 'variable', attrs: { key } });

const template: TemplateFile = {
  ...BASE_TEMPLATE,
  header: { content: [paragraph(text('Interface notes'))] },
  footer: { content: [paragraph(text('Page '), variable('page.current'))] },
  sections: [{ name: 'annex', header: { content: [paragraph(text('Annex'))] } }],
};

const document = () =>
  readDocumentFile(
    {
      formatVersion: 1,
      sections: [
        { name: null, content: [paragraph(text('Body'))] },
        { name: 'annex', content: [paragraph(text('Annex body'))] },
      ],
    },
    documentSchema,
  ).doc;

const regionOf = (doc: ReturnType<typeof document>, section: number, index: number) =>
  doc.child(section).child(0).child(index);
const textIn = (doc: ReturnType<typeof document>, section: number, index: number) =>
  regionOf(doc, section, index).textContent;

describe('page regions', () => {
  it("DOCE-TEMPLATES-6.1 fills each section's pages with its template header and footer", () => {
    const tr = setPageRegions(new Transform(document()), template);
    const header = regionOf(tr.doc, 0, 0);
    expect(textIn(tr.doc, 0, 0)).toBe('Interface notes');
    expect(header.attrs.editable).toBe(false);
    const footer = regionOf(tr.doc, 0, 3);
    expect(footer.child(0).child(1).type.name).toBe('template_variable');
    expect(footer.child(0).child(1).attrs.variableKey).toBe('page.current');
    expect(textIn(tr.doc, 1, 0)).toBe('Annex');
    expect(textIn(tr.doc, 1, 3)).toBe('Page ');
    expect(textIn(tr.doc, 0, 1)).toBe('Body');
    expect(setPageRegions(new Transform(tr.doc), template).steps).toHaveLength(0);
  });

  it('DOCE-TEMPLATES-6.1 leaves a region as it is when it cannot hold the content', () => {
    // A column layout sits in a section's content, never in a header or footer.
    const columns: StoredNode = {
      type: 'columns',
      content: [
        { type: 'column', content: [paragraph(text('Left'))] },
        { type: 'column', content: [paragraph(text('Right'))] },
      ],
    };
    const unheld: TemplateFile = {
      ...template,
      header: { content: [columns] },
      footer: { content: [{ type: 'poster' }] },
    };
    const filled = setPageRegions(new Transform(document()), template).doc;
    const tr = setPageRegions(new Transform(filled), unheld);
    expect(tr.steps).toHaveLength(0);
    expect(textIn(tr.doc, 0, 0)).toBe('Interface notes');
    expect(textIn(tr.doc, 0, 3)).toBe('Page ');
    // Whether the regions can be edited still changes, with the content they hold.
    const editable = setPageRegions(new Transform(filled), unheld, { editable: true });
    expect(regionOf(editable.doc, 0, 0).attrs.editable).toBe(true);
    expect(textIn(editable.doc, 0, 0)).toBe('Interface notes');
    // A document section's own region that the page cannot hold is left as it is too.
    const own = readDocumentFile(
      {
        formatVersion: 1,
        sections: [{ name: null, header: { content: [columns] }, content: [paragraph(text('B'))] }],
      },
      documentSchema,
    ).doc;
    expect(
      setPageRegions(new Transform(own), template).doc.child(0).child(0).child(0).childCount,
    ).toBe(0);
  });

  it("DOCE-TEMPLATES-6.2 shows a document section's own header and footer over its template's", () => {
    const doc = readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          {
            name: 'annex',
            header: { content: [paragraph(text('Own annex'))] },
            footer: { height: '12mm' },
            content: [paragraph(text('Annex body'))],
          },
          { name: 'annex', header: { inherit: true }, content: [paragraph(text('More'))] },
        ],
      },
      documentSchema,
    ).doc;
    const tr = setPageRegions(new Transform(doc), template);
    expect(textIn(tr.doc, 0, 0)).toBe('Own annex');
    expect(textIn(tr.doc, 0, 3)).toBe('Page ');
    expect(textIn(tr.doc, 1, 0)).toBe('Annex');
  });
});
