import { describe, expect, it } from 'vitest';
import {
  composeDocumentFile,
  createDocumentFile,
  type DocumentFile,
  findTemplateSection,
  requiredTemplateSections,
  type StoredNode,
  type TemplateFile,
} from '../index.js';

const TEMPLATE: Pick<TemplateFile, 'sections'> = {
  sections: [
    { name: 'intro', required: true },
    { name: 'scope', required: false },
    { name: 'annex' },
    { name: 'body', required: true },
  ],
};

describe('template sections', () => {
  it('DOCE-TEMPLATES-4.1 finds a section by name', () => {
    expect(findTemplateSection(TEMPLATE, 'scope')).toBe(TEMPLATE.sections?.[1]);
    expect(findTemplateSection(TEMPLATE, 'Scope')).toBeNull();
    expect(findTemplateSection(TEMPLATE, null)).toBeNull();
    expect(findTemplateSection({}, 'scope')).toBeNull();
  });

  it('DOCE-TEMPLATES-4.2 lists the sections every document has', () => {
    expect(requiredTemplateSections(TEMPLATE).map((section) => section.name)).toEqual([
      'intro',
      'body',
    ]);
    expect(requiredTemplateSections({})).toEqual([]);
  });
});

const paragraph = (text: string, id?: string): StoredNode => ({
  type: 'paragraph',
  ...(id ? { attrs: { id } } : {}),
  content: [{ type: 'text', text }],
});

const LOCKED: TemplateFile = {
  formatVersion: 1,
  id: 'sample',
  page: { size: 'A4', margins: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' } },
  sections: [
    { name: 'notice', required: true, editable: false, content: [paragraph('Fixed notice.')] },
    { name: 'summary', required: true, content: [paragraph('Write a summary.')] },
    { name: 'body', required: true },
    { name: 'notes', insertable: true },
    {
      name: 'wide',
      page: { size: 'A4', orientation: 'landscape' },
    },
  ],
};

// Ids 00000001, 00000002, … in the order they are asked for.
const counter = () => {
  let next = 0;
  return () => (next += 1).toString(16).padStart(8, '0');
};

const textOf = (file: DocumentFile) =>
  file.sections.map((section) => [
    section.name ?? null,
    section.content.map((node) => node.content?.[0]?.text ?? node.type),
  ]);

describe('new and composed documents', () => {
  it('DOCE-IMPORT-3.1 makes a new document with the template required sections', () => {
    const file = createDocumentFile({ template: LOCKED, revision: 'r7', newId: counter() });
    expect(file.template).toEqual({ id: 'sample', revision: 'r7' });
    expect(textOf(file)).toEqual([
      ['notice', ['Fixed notice.']],
      ['summary', ['Write a summary.']],
      ['body', []],
    ]);
    expect(file.sections[0]).toEqual({
      name: 'notice',
      editable: false,
      content: [paragraph('Fixed notice.')],
    });
    expect(file.sections[1]?.content[0]?.attrs).toEqual({ id: '00000001' });
    expect(LOCKED.sections?.[1]?.content?.[0]?.attrs).toBeUndefined();
  });

  it('DOCE-IMPORT-3.1 gives a template without sections one empty section', () => {
    const file = createDocumentFile({
      template: { formatVersion: 1, id: 'plain' },
      newId: counter(),
    });
    expect(file).toEqual({
      formatVersion: 1,
      template: { id: 'plain' },
      sections: [{ content: [] }],
    });
  });

  it('DOCE-IMPORT-3.2 composes content into the first editable section', () => {
    const file = composeDocumentFile([paragraph('One'), paragraph('Two', '0000abcd')], {
      template: LOCKED,
      newId: counter(),
      author: 'importer',
    });
    expect(textOf(file)).toEqual([
      ['notice', ['Fixed notice.']],
      ['summary', ['One', 'Two']],
      ['body', []],
    ]);
    expect(file.sections[1]?.content.map((node) => node.attrs)).toEqual([
      { id: '00000001', author: 'importer' },
      { id: '0000abcd' },
    ]);
    expect(file.sections[0]?.content[0]?.attrs).toBeUndefined();
  });

  it('DOCE-IMPORT-3.2 places named sections and fills the chosen section with the rest', () => {
    const incoming: DocumentFile = {
      formatVersion: 1,
      sections: [
        { name: 'notes', header: { content: [] }, content: [paragraph('A note')] },
        { content: [paragraph('Loose')] },
        { name: 'notice', content: [paragraph('Not allowed')] },
      ],
    };
    const file = composeDocumentFile(incoming, {
      template: LOCKED,
      section: 'body',
      newId: counter(),
    });
    expect(textOf(file)).toEqual([
      ['notice', ['Fixed notice.']],
      ['summary', ['Write a summary.']],
      ['body', ['Loose', 'Not allowed']],
      ['notes', ['A note']],
    ]);
    expect(file.sections[3]?.header).toBeUndefined();
    expect(() =>
      composeDocumentFile([], { template: LOCKED, section: 'notice', newId: counter() }),
    ).toThrow('no editable section named notice');
  });

  it('DOCE-IMPORT-3.2 fills the first editable section the document has, else adds the first one', () => {
    const optionalFirst: TemplateFile = {
      formatVersion: 1,
      id: 'optional-first',
      sections: [
        { name: 'notice', required: true, editable: false, content: [paragraph('Fixed.')] },
        { name: 'extra' },
        { name: 'body', required: true },
      ],
    };
    expect(
      textOf(
        composeDocumentFile([paragraph('One')], { template: optionalFirst, newId: counter() }),
      ),
    ).toEqual([
      ['notice', ['Fixed.']],
      ['body', ['One']],
    ]);
    const lockedOnly: TemplateFile = {
      ...optionalFirst,
      sections: [
        { name: 'notice', required: true, editable: false, content: [paragraph('Fixed.')] },
        { name: 'extra' },
        { name: 'later' },
      ],
    };
    expect(
      textOf(composeDocumentFile([paragraph('One')], { template: lockedOnly, newId: counter() })),
    ).toEqual([
      ['notice', ['Fixed.']],
      ['extra', ['One']],
    ]);
  });

  it('DOCE-IMPORT-3.3 fits a wide table to its section page content width', () => {
    const table: StoredNode = {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [1000, 1000].map((width) => ({
            type: 'tableCell',
            attrs: { colwidth: [width] },
            content: [paragraph('Cell')],
          })),
        },
      ],
    };
    const file = composeDocumentFile(
      { formatVersion: 1, sections: [{ content: [table] }, { name: 'wide', content: [table] }] },
      { template: LOCKED, newId: counter() },
    );
    const widthsIn = (name: string) =>
      file.sections
        .find((section) => section.name === name)
        ?.content.find((node) => node.type === 'table')
        ?.content?.[0]?.content?.map((cell) => (cell.attrs?.colwidth as number[])[0]);
    // A4 is 793.7 pixels wide less two 75.6 pixel margins; landscape, 1122.5 less the same.
    expect(widthsIn('summary')).toEqual([321, 321]);
    expect(widthsIn('wide')).toEqual([485, 485]);
  });
});
