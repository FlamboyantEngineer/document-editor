import { describe, expect, it } from 'vitest';
import {
  composeDocumentFile,
  findAppendixSection,
  type StoredNode,
  type TemplateFile,
} from '../index.js';
import { templatePageMetrics } from './template-properties.js';

const paragraph = (text: string): StoredNode => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});
const title = (text: string): StoredNode => ({
  type: 'heading',
  attrs: { title: true },
  content: [{ type: 'text', text }],
});
const table = (...widths: number[]): StoredNode => ({
  type: 'table',
  content: [
    {
      type: 'tableRow',
      content: widths.map((width) => ({
        type: 'tableCell',
        attrs: { colwidth: [width] },
        content: [paragraph('x')],
      })),
    },
  ],
});

const counter = () => {
  let next = 0;
  return () => (next += 1).toString(16).padStart(8, '0');
};

const TEMPLATE = (cover: StoredNode[]): TemplateFile => ({
  formatVersion: 1,
  id: 'report',
  page: { size: 'A4', margins: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' } },
  sections: [
    { name: 'cover', required: true, editable: false, content: cover },
    { name: 'main', required: true },
    { name: 'annexes', label: 'Appendix' },
  ],
});

const texts = (nodes: readonly StoredNode[] | undefined) =>
  (nodes ?? []).map((node) => node.type + ':' + (node.content?.[0]?.text ?? ''));

describe('composing imported documents', () => {
  it('DOCE-IMPORT-3.5 leaves out the title and its title page when another section shows the title', () => {
    const content = [
      { type: 'paragraph' },
      title('Report'),
      { type: 'pageBreak' },
      { type: 'paragraph' },
      paragraph('Body'),
    ];
    const shown = composeDocumentFile(content, {
      template: TEMPLATE([title('Cover')]),
      newId: counter(),
    });
    expect(texts(shown.sections[1]?.content)).toEqual(['paragraph:Body']);
    const byVariable = composeDocumentFile(content, {
      template: TEMPLATE([
        { type: 'paragraph', content: [{ type: 'text', text: '{{doc.name}}' }] },
      ]),
      titleVariables: ['doc.name'],
      newId: counter(),
    });
    expect(texts(byVariable.sections[1]?.content)).toEqual(['paragraph:Body']);
    const notShown = composeDocumentFile(content, {
      template: TEMPLATE([paragraph('Cover')]),
      newId: counter(),
    });
    expect(texts(notShown.sections[1]?.content)).toEqual([
      'paragraph:',
      'heading:Report',
      'pageBreak:',
      'paragraph:',
      'paragraph:Body',
    ]);
    const later = composeDocumentFile(
      [paragraph('Intro'), title('Late title'), paragraph('Body')],
      {
        template: TEMPLATE([title('Cover')]),
        newId: counter(),
      },
    );
    expect(texts(later.sections[1]?.content)).toEqual(['paragraph:Intro', 'paragraph:Body']);
  });

  it('DOCE-IMPORT-3.3 fills the content width with each table in proportion, less an inset', () => {
    const template = TEMPLATE([]);
    const { width, margins } = templatePageMetrics(template, null);
    const usable = width - margins.left - margins.right;
    const file = composeDocumentFile([table(100, 300), table(1000, 1000, 1001)], {
      template,
      tables: 'fill',
      tableInset: 4,
      newId: counter(),
    });
    const widths = (file.sections[1]?.content ?? []).map((node) =>
      (node.content?.[0]?.content ?? []).map((cell) => (cell.attrs?.colwidth as number[])[0]),
    );
    for (const columns of widths) {
      expect(columns.reduce((total: number, each) => total + (each ?? 0), 0)).toBe(
        Math.floor(usable) - 4,
      );
      expect(columns.every(Number.isInteger)).toBe(true);
    }
    expect(Math.abs((widths[0]?.[1] ?? 0) - 3 * (widths[0]?.[0] ?? 0))).toBeLessThanOrEqual(3);
    const fitted = composeDocumentFile([table(100, 300)], { template, newId: counter() });
    expect(fitted.sections[1]?.content[0]?.content?.[0]?.content?.[1]?.attrs?.colwidth).toEqual([
      300,
    ]);
  });

  it('DOCE-IMPORT-3.6 finds the appendix section by name or label, unless it is the target', () => {
    const template = TEMPLATE([]);
    expect(findAppendixSection(template)).toBe('annexes');
    expect(findAppendixSection(template, 'annexes')).toBeNull();
    expect(
      findAppendixSection({ sections: [{ name: 'appendix' }, { name: 'main' }] }, 'main'),
    ).toBe('appendix');
    expect(findAppendixSection({ sections: [{ name: 'main' }] })).toBeNull();
    const file = composeDocumentFile(
      {
        formatVersion: 1,
        sections: [
          { content: [paragraph('Body')] },
          { name: 'annexes', content: [paragraph('Appendix A')] },
        ],
      },
      { template, newId: counter() },
    );
    expect(file.sections.map((section) => [section.name, texts(section.content)])).toEqual([
      ['cover', []],
      ['main', ['paragraph:Body']],
      ['annexes', ['paragraph:Appendix A']],
    ]);
  });

  it('DOCE-IMPORT-3.1 makes the list tokens of the sections it keeps lists of contents', () => {
    const file = composeDocumentFile([paragraph('Body')], {
      template: TEMPLATE([paragraph('{{list_of_tables}}')]),
      newId: counter(),
    });
    expect(file.sections[0]?.content[0]).toMatchObject({
      type: 'contents',
      attrs: { kind: 'tables' },
    });
  });
});
