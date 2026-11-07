import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { TEMPLATE_SHAPE, type TemplateFile, validateTemplateFile } from '../index.js';

const TEMPLATE: TemplateFile = {
  formatVersion: 1,
  id: 'report',
  name: 'Report',
  parent: 'base',
  page: { size: 'A4', orientation: 'portrait', margins: { top: '25mm', left: '1in' } },
  styles: {
    paragraph: {
      font: 'Arial',
      size: '11pt',
      lineHeight: 1.4,
      numbering: { format: '1.', levels: [{ format: 'a)', textIndent: '12pt' }] },
    },
    heading1: { weight: 700, color: '#111827', numbering: { format: '1.', prefix: '' } },
    table: { caption: { placement: 'above', label: { weight: 600 } }, repeatHeader: true },
    custom: { lead: { size: '14pt' } },
  },
  header: {
    content: [
      { type: 'paragraph', content: [{ type: 'variable', attrs: { key: 'page.current' } }] },
    ],
  },
  footnotes: { numbering: 'page', separator: { enabled: false } },
  references: {
    formats: { 'internal-figure': 'Figure {{ref.numbering}}' },
    links: { 'internal-table': false },
  },
  sections: [{ name: 'scope', required: true, content: [{ type: 'paragraph' }] }],
  extensions: { host: { anything: [1, 2] } },
};

describe('stored template format', () => {
  it('DOCE-FORMAT-2.1 accepts every setting of the format', () => {
    expect(validateTemplateFile(TEMPLATE, { schema: documentSchema })).toEqual([]);
    expect(Object.keys((TEMPLATE_SHAPE as { object: object }).object)).toContain('sections');
  });

  it('DOCE-FORMAT-2.2 names each setting that is unknown or of the wrong kind', () => {
    const errors = validateTemplateFile(
      {
        ...TEMPLATE,
        page: { size: 'B7', margins: { top: 12 } },
        styles: { paragraph: { fontColor: '#000', lineHeight: 0, size: '11' } },
        footnotes: { numbering: 'per-page' },
      },
      { schema: documentSchema },
    );
    expect(errors).toEqual([
      expect.stringContaining('template.page.size must be one of A0'),
      'template.page.margins.top must be a length with a unit, such as 12pt',
      'template.styles.paragraph.fontColor is not a template setting',
      'template.styles.paragraph.lineHeight must be a positive number',
      'template.styles.paragraph.size must be a length with a unit, such as 12pt',
      'template.footnotes.numbering must be one of document, page',
    ]);
  });

  it('DOCE-FORMAT-2.3 checks the template identity, references and sections', () => {
    const errors = validateTemplateFile({
      ...TEMPLATE,
      id: 'my report',
      name: 'Bad\u0007name',
      references: { formats: { poster: 'x', 'internal-heading': '{{nope}}' } },
      sections: [{ name: 'Scope' }, { name: 'a' }, { name: 'a' }],
    });
    expect(errors).toEqual([
      'template.id must use letters, digits, underscores or hyphens',
      'template.name must not contain control or formatting characters',
      'template.references.formats.poster is not a reference type',
      expect.stringContaining('template.references.formats.internal-heading: Use only'),
      'template.sections[0].name must use lower-case letters, digits or underscores',
      'template.sections[2].name is used by another section',
    ]);
    expect(validateTemplateFile({ ...TEMPLATE, formatVersion: 0 })).toEqual([
      'template.formatVersion must be 1',
    ]);
  });

  it('DOCE-FORMAT-2.4 checks template content against the schema', () => {
    const errors = validateTemplateFile(
      { ...TEMPLATE, header: { content: [{ type: 'poster' }] } },
      { schema: documentSchema },
    );
    expect(errors).toEqual(['template.header.content: [0]: unknown node poster']);
    expect(validateTemplateFile({ ...TEMPLATE, header: { content: 'Header' } })).toEqual([
      'template.header.content must be a list of content',
    ]);
  });
});
