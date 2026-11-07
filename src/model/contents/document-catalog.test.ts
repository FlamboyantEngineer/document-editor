import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import {
  BASE_TEMPLATE,
  catalogDocument,
  readDocumentFile,
  type StoredNode,
  type TemplateFile,
} from '../index.js';

const text = (value: string): StoredNode => ({ type: 'text', text: value });
const heading = (level: number, value: string): StoredNode => ({
  type: 'heading',
  attrs: { level },
  content: [text(value)],
});
const paragraph = (value: string): StoredNode => ({ type: 'paragraph', content: [text(value)] });
const table = (caption: string, captionEnabled = true): StoredNode => ({
  type: 'table',
  attrs: { caption, ...(captionEnabled ? {} : { captionEnabled: false }) },
  content: [
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
);

const brief = (entries: readonly { number: string; text: string; page: number }[]) =>
  entries.map(({ number, text: value, page }) => `${number}|${value}|${String(page)}`);

describe('document catalog', () => {
  it('DOCE-CONTENTS-1.1 numbers headings as the stylesheet does, by section scope', () => {
    const catalog = catalogDocument(doc, appendix);
    expect(brief(catalog.heading)).toEqual([
      '1.|Scope|1',
      '1.1.|Purpose|1',
      '2.|Interfaces|1',
      '|Detail|1',
      'A.|Glossary|2',
    ]);
    expect(catalog.heading.map((entry) => entry.level)).toEqual([1, 2, 1, 4, 1]);
    const first = catalog.heading[0];
    expect(doc.nodeAt(first?.pos ?? 0)?.textContent).toBe('Scope');
  });

  it('DOCE-CONTENTS-1.2 numbers captioned objects with their heading context and restarts', () => {
    const catalog = catalogDocument(doc, appendix);
    expect(brief(catalog.table)).toEqual([
      'Table 1|Before any chapter|1',
      'Table 1.1|Limits|1',
      'Table 2.1|Signals|1',
      'Table A.1|Terms|2',
    ]);
  });
});
