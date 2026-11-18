import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import {
  BASE_TEMPLATE,
  catalogDocument,
  numberingCountersAt,
  readDocumentFile,
  type StoredNode,
  type TemplateFile,
} from '../index.js';
import { storedCaption } from '../schema/caption-content.js';

const text = (value: string): StoredNode => ({ type: 'text', text: value });
const heading = (level: number, value: string): StoredNode => ({
  type: 'heading',
  attrs: { level },
  content: [text(value)],
});
const paragraph = (value: string): StoredNode => ({ type: 'paragraph', content: [text(value)] });
const table = (caption: string, captionEnabled = true): StoredNode => ({
  type: 'table',
  ...(captionEnabled ? {} : { attrs: { captionEnabled: false } }),
  content: [
    storedCaption(caption),
    {
      type: 'tableRow',
      content: [{ type: 'tableCell', content: [paragraph('Cell')] }],
    },
  ],
});

const appendix: TemplateFile = {
  ...BASE_TEMPLATE,
  sections: [
    {
      name: 'appendix',
      styles: { heading1: { numbering: { format: 'A.' } } },
    },
  ],
};

const doc = readDocumentFile(
  {
    formatVersion: 1,
    sections: [
      {
        name: null,
        content: [
          table('Before any chapter'),
          heading(1, 'Scope'),
          heading(2, 'Purpose'),
          table('Limits'),
          table('Hidden caption', false),
          heading(1, 'Interfaces'),
          table('Signals'),
          heading(4, 'Detail'),
        ],
      },
      { name: 'appendix', content: [heading(1, 'Glossary'), table('Terms')] },
    ],
  },
  documentSchema,
).doc;

const brief = (entries: readonly { number: string; text: string; page: number }[] = []) =>
  entries.map(({ number, text: value, page }) => `${number}|${value}|${String(page)}`);

describe('document catalog', () => {
  it('DOCE-CONTENTS-1.1 numbers headings as the stylesheet does, by section scope', () => {
    const catalog = catalogDocument(doc, appendix);
    expect(brief(catalog.toc)).toEqual([
      '1.|Scope|1',
      '1.1.|Purpose|1',
      '2.|Interfaces|1',
      '|Detail|1',
      'A.|Glossary|2',
    ]);
    expect(catalog.toc?.map((entry) => entry.level)).toEqual([1, 2, 1, 4, 1]);
    const first = catalog.toc?.[0];
    expect(doc.nodeAt(first?.pos ?? 0)?.textContent).toBe('Scope');
  });

  it('DOCE-CONTENTS-1.1 leaves out headings inside a list or a table', () => {
    const nested = readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          {
            name: null,
            content: [
              heading(1, 'Scope'),
              {
                type: 'table',
                content: [
                  {
                    type: 'tableRow',
                    content: [{ type: 'tableCell', content: [heading(2, 'In a cell')] }],
                  },
                ],
              },
              heading(1, 'Interfaces'),
            ],
          },
        ],
      },
      documentSchema,
    ).doc;
    expect(brief(catalogDocument(nested, BASE_TEMPLATE).toc)).toEqual([
      '1.|Scope|1',
      '2.|Interfaces|1',
    ]);
  });

  it('DOCE-CONTENTS-1.2 numbers captioned objects with their heading context and restarts', () => {
    const catalog = catalogDocument(doc, appendix);
    expect(brief(catalog.tables)).toEqual([
      'Table 1|Before any chapter|1',
      'Table 1.1|Limits|1',
      'Table 2.1|Signals|1',
      'Table A.1|Terms|2',
    ]);
  });

  it('DOCE-CONTENTS-1.2 neither numbers nor lists a figure or code block whose caption is hidden', () => {
    const figure = (caption: string, shown = true): StoredNode => ({
      type: 'figure',
      attrs: { src: 'a.png', ...(shown ? {} : { captionEnabled: false }) },
      content: [storedCaption(caption)],
    });
    const code = (caption: string, shown = true): StoredNode => ({
      type: 'codeBlock',
      attrs: { caption, ...(shown ? {} : { captionEnabled: false }) },
      content: [text('x = 1')],
    });
    const objects = readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          {
            name: null,
            content: [
              figure('First'),
              figure('Hidden', false),
              figure('Second'),
              code('Listing', false),
              code('Shown'),
            ],
          },
        ],
      },
      documentSchema,
    ).doc;
    const catalog = catalogDocument(objects, BASE_TEMPLATE);
    expect(brief(catalog.figures)).toEqual(['Figure 1|First|1', 'Figure 2|Second|1']);
    expect(brief(catalog.codeBlocks)).toEqual(['Code Block 1|Shown|1']);
    expect(numberingCountersAt(objects, BASE_TEMPLATE, objects.content.size).objects).toMatchObject(
      { figure: 2, codeBlock: 1 },
    );
  });

  it('DOCE-CONTENTS-1.3 lists any node type a configured kind names', () => {
    const quotes = readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          {
            name: null,
            content: [
              heading(1, 'Scope'),
              { type: 'blockquote', content: [paragraph('First quote')] },
              paragraph('Between'),
              { type: 'blockquote', content: [paragraph('Second quote')] },
            ],
          },
        ],
      },
      documentSchema,
    ).doc;
    const catalog = catalogDocument(quotes, BASE_TEMPLATE, {
      quotes: { nodes: ['blockquote'], number: (node) => `Q${node.childCount}` },
      chapters: { nodes: ['heading'], text: (node) => node.textContent.toUpperCase() },
    });
    expect(Object.keys(catalog)).toEqual(['quotes', 'chapters']);
    expect(brief(catalog.quotes)).toEqual(['Q1|First quote|1', 'Q1|Second quote|1']);
    expect(catalog.quotes?.map((entry) => entry.level)).toEqual([0, 0]);
    expect(brief(catalog.chapters)).toEqual(['1.|SCOPE|1']);
  });

  it('DOCE-CONTENTS-1.4 orders the entries of a kind and lists each text once if it asks', () => {
    const terms = readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          {
            name: null,
            content: [paragraph('Volt'), paragraph('Ampere'), paragraph('Volt'), paragraph('Ohm')],
          },
        ],
      },
      documentSchema,
    ).doc;
    const catalog = catalogDocument(terms, BASE_TEMPLATE, {
      terms: { nodes: ['paragraph'], unique: true, sort: (a, b) => a.text.localeCompare(b.text) },
    });
    expect(catalog.terms?.map((entry) => entry.text)).toEqual(['Ampere', 'Ohm', 'Volt']);
  });

  it('DOCE-CONTENTS-1.5 lists each cited document once, by its number', () => {
    const cite = (value: string, attrs: Record<string, unknown>): StoredNode => ({
      type: 'text',
      text: value,
      marks: [{ type: 'reference', attrs }],
    });
    const cited = readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          {
            name: null,
            content: [
              heading(1, 'Scope'),
              {
                type: 'paragraph',
                content: [
                  text('See '),
                  cite('the interface standard', {
                    referenceType: 'external-document',
                    number: 'STD-2',
                    title: 'Interface standard',
                  }),
                  text(' and '),
                  cite('the scope', { target: 'a1b2c3d4' }),
                  text(' and '),
                  cite('the handbook', {
                    referenceType: 'external-document',
                    number: 'HB-1',
                    title: 'Handbook',
                  }),
                ],
              },
              {
                type: 'paragraph',
                content: [
                  cite('the standard again', {
                    referenceType: 'external-document',
                    number: 'STD-2',
                    title: 'Interface standard',
                  }),
                  text(', '),
                  cite('a catalogue entry', {
                    referenceType: 'external-document',
                    targetLabel: 'Part list',
                  }),
                ],
              },
            ],
          },
        ],
      },
      documentSchema,
    ).doc;
    const { references } = catalogDocument(cited, BASE_TEMPLATE);
    expect(references?.map(({ number, text: value }) => `${number}|${value}`)).toEqual([
      'HB-1|Handbook',
      'STD-2|Interface standard',
      '|Part list',
    ]);
    expect(cited.textBetween(references?.[0]?.pos ?? 0, (references?.[0]?.pos ?? 0) + 3)).toBe(
      'the',
    );
  });

  it('DOCE-CONTENTS-1.5 drops a citation that names no document number beside one of the same document that does', () => {
    const cite = (value: string, attrs: Record<string, unknown>): StoredNode => ({
      type: 'text',
      text: value,
      marks: [{ type: 'reference', attrs: { referenceType: 'external-document', ...attrs } }],
    });
    const cited = readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          {
            name: null,
            content: [
              {
                type: 'paragraph',
                content: [
                  cite('STD-9 § 8.4', { target: 'doc-9' }),
                  text(' and '),
                  cite('the standard', { target: 'doc-9', number: 'STD-9', title: 'Quality' }),
                  text(' and '),
                  cite('the notes § 2', { target: 'doc-4' }),
                ],
              },
            ],
          },
        ],
      },
      documentSchema,
    ).doc;
    const { references } = catalogDocument(cited, BASE_TEMPLATE);
    // The document cited only without its number still lists, from what it reads.
    expect(references?.map(({ number, text: value }) => `${number}|${value}`)).toEqual([
      'STD-9|Quality',
      '|the notes § 2',
    ]);
  });

  it('DOCE-CONTENTS-1.6 lists each abbreviation once, alphabetically, with its expansion', () => {
    const abbreviation = (abbr: string, expansion: string): StoredNode => ({
      type: 'abbreviation',
      attrs: { entry: abbr.toLowerCase(), abbreviation: abbr, expansion },
    });
    const used = readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          {
            name: null,
            content: [
              {
                type: 'paragraph',
                content: [
                  abbreviation('RAM', 'Random access memory'),
                  text(' and '),
                  abbreviation('CPU', 'Central processing unit'),
                ],
              },
              { type: 'paragraph', content: [abbreviation('RAM', 'Random access memory')] },
            ],
          },
        ],
      },
      documentSchema,
    ).doc;
    const { abbreviations } = catalogDocument(used, BASE_TEMPLATE);
    expect(abbreviations?.map(({ number, text: value }) => `${number}|${value}`)).toEqual([
      'CPU|Central processing unit',
      'RAM|Random access memory',
    ]);
    expect(used.nodeAt(abbreviations?.[1]?.pos ?? 0)?.attrs.abbr).toBe('RAM');
  });

  it('DOCE-CONTENTS-1.7 gives the counters a position is under, as the stylesheet counts them', () => {
    const at = (value: string) => {
      let found = -1;
      doc.descendants((node, pos) => {
        if (found < 0 && node.isBlock && node.textContent === value) found = pos;
        return found < 0;
      });
      return found;
    };
    expect(numberingCountersAt(doc, appendix, 0)).toEqual({
      headings: [0, 0, 0, 0, 0, 0],
      objects: { figure: 0, table: 0, codeBlock: 0, equation: 0 },
    });
    expect(numberingCountersAt(doc, appendix, at('Interfaces'))).toMatchObject({
      headings: [1, 1, 0, 0, 0, 0],
      objects: { table: 1 },
    });
    expect(numberingCountersAt(doc, appendix, at('Detail'))).toMatchObject({
      headings: [2, 0, 0, 0, 0, 0],
      objects: { table: 1 },
    });
  });

  it('DOCE-CONTENTS-1.8 leaves out the front matter before the first table of contents', () => {
    const cite = (number: string): StoredNode => ({
      type: 'text',
      text: number,
      marks: [{ type: 'reference', attrs: { referenceType: 'external-document', number } }],
    });
    const abbreviation = (abbr: string, entry: string): StoredNode => ({
      type: 'abbreviation',
      attrs: { entry, abbreviation: abbr, expansion: `${abbr} expanded` },
    });
    const fronted = readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          {
            name: null,
            content: [
              heading(1, 'Foreword'),
              table('Revision record'),
              {
                type: 'paragraph',
                content: [
                  cite('STD-1'),
                  text(' '),
                  cite('STD-2'),
                  text(' '),
                  abbreviation('AC', 'ac'),
                ],
              },
              { type: 'contents', attrs: { kind: 'toc' } },
              heading(1, 'Scope'),
              { ...table('Limits'), attrs: { id: 'limits-table' } },
              {
                type: 'paragraph',
                content: [
                  cite('STD-3'),
                  text(' '),
                  cite('STD-1'),
                  text(' '),
                  abbreviation('AC', 'ac'),
                ],
              },
              { type: 'paragraph', content: [abbreviation('AC', 'ac-2')] },
              { type: 'mathBlock', content: [text('x^2')] },
              { type: 'linkedCode', attrs: { url: 'https://example.com/src/main.c' } },
              { type: 'contents', attrs: { kind: 'toc' } },
            ],
          },
        ],
      },
      documentSchema,
    ).doc;
    const catalog = catalogDocument(fronted, BASE_TEMPLATE);
    // The foreword keeps its number too.
    expect(brief(catalog.toc)).toEqual(['2.|Scope|1']);
    expect(catalog.tables?.map(({ number, text: value }) => `${number}|${value}`)).toEqual([
      'Table 2.1|Limits',
    ]);
    expect(catalog.tables?.[0]?.target).toBe('limits-table');
    // A document cited before and after the list is listed at its first citation after it.
    expect(catalog.references?.map((entry) => entry.number)).toEqual(['STD-1', 'STD-3']);
    expect(catalog.references?.[0]?.pos).toBeGreaterThan(catalog.toc?.[0]?.pos ?? Infinity);
    // Abbreviations count the whole document, one entry per glossary entry.
    expect(catalog.abbreviations?.map((entry) => entry.identity)).toEqual(['ac', 'ac-2']);
    expect(catalog.equations?.map(({ number, text: value }) => `${number}|${value}`)).toEqual([
      '(Eq. 2.1.)|',
    ]);
    expect(catalog.codeBlocks?.[0]?.text).toBe('main.c');
  });

  it('DOCE-CONTENTS-1.1 lists a heading by its text without what a suggestion deletes', () => {
    const suggested = readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          {
            name: null,
            content: [
              {
                type: 'heading',
                attrs: { level: 1 },
                content: [
                  {
                    type: 'text',
                    text: 'Old ',
                    marks: [{ type: 'deletion', attrs: { id: 's1' } }],
                  },
                  {
                    type: 'text',
                    text: 'New ',
                    marks: [{ type: 'insertion', attrs: { id: 's2' } }],
                  },
                  text('scope'),
                ],
              },
            ],
          },
        ],
      },
      documentSchema,
    ).doc;
    expect(catalogDocument(suggested, BASE_TEMPLATE).toc?.map((entry) => entry.text)).toEqual([
      'New scope',
    ]);
  });
});
