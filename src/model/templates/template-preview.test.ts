import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { readDocumentFile } from '../format/document-format-convert.js';
import type { TemplateFile } from '../format/template-format.js';
import { withEditableSections, withTemplatePart } from './template-parts.js';
import { templatePartSections, templatePreviewDocument } from './template-preview.js';

const TEMPLATE: TemplateFile = {
  formatVersion: 1,
  id: 'preview',
  name: 'Specification',
  styles: { custom: { note: { size: '9pt' } } },
  sections: [
    { name: 'appendix', label: 'Appendix' },
    {
      name: 'approvals',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Approved by' }] }],
    },
  ],
};

const paragraph = (value: string) => ({
  type: 'paragraph',
  content: [{ type: 'text', text: value }],
});

const types = (doc: ProseMirrorNode) => {
  const found = new Set<string>();
  doc.descendants((node) => {
    found.add(node.type.name);
  });
  return found;
};

describe('template preview', () => {
  it('DOCE-TEMPLATES-8.2 shows every style a template sets, then each of its sections', () => {
    const file = templatePreviewDocument(TEMPLATE);
    expect(file.sections.map((section) => section.name)).toEqual([null, 'appendix', 'approvals']);
    const doc = readDocumentFile(file, documentSchema).doc;
    expect([...types(doc)]).toEqual(
      expect.arrayContaining([
        'heading',
        'toc_block',
        'footnote_reference',
        'bullet_list',
        'ordered_list',
        'table',
        'code_block',
        'math_display',
      ]),
    );
    const levels = new Set<number>();
    let title = '';
    doc.descendants((node) => {
      if (node.type.name !== 'heading') return;
      if (node.attrs.docTitle) title = node.textContent;
      else levels.add(node.attrs.level as number);
    });
    expect(title).toBe('Specification');
    expect([...levels].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    const all = doc.textBetween(0, doc.content.size, ' ');
    expect(all).toContain('Text in the note style.');
    expect(all).toContain('Appendix');
    expect(all).toContain('Approved by');
    // The equation shows its LaTeX, as stored math holds it.
    let equation = '';
    doc.descendants((node) => {
      if (node.type.name === 'math_display') equation = node.textContent;
    });
    expect(equation).not.toBe('');
  });

  it('DOCE-TEMPLATES-8.8 shows nested lists, a figure, two footnotes and objects long enough to continue', () => {
    const doc = readDocumentFile(templatePreviewDocument(TEMPLATE), documentSchema).doc;
    let notes = 0;
    let rows = 0;
    let figures = 0;
    doc.descendants((node) => {
      if (node.type.name === 'footnote_reference') notes += 1;
      if (node.type.name === 'figure') figures += 1;
      if (node.type.name === 'table_row') rows += 1;
    });
    expect(notes).toBe(2);
    expect(figures).toBe(1);
    expect(rows).toBeGreaterThan(40);
    const bullets: number[] = [];
    doc.descendants((node) => {
      if (node.type.name === 'bullet_list') bullets.push(node.childCount);
    });
    // Three items, each with two under it, each with one under that.
    expect(bullets).toEqual([3, 2, 1, 1, 2, 1, 1, 2, 1, 1]);
  });

  it('DOCE-TEMPLATES-8.6 DOCE-TEMPLATE-EDITOR-3.16 shows one section alone, then the sample in it', () => {
    const file = templatePreviewDocument(TEMPLATE, undefined, { parts: true, scope: 'approvals' });
    expect(file.sections.map((section) => section.name)).toEqual([
      'approvals',
      'approvals',
      'approvals',
    ]);
    const doc = readDocumentFile(file, documentSchema).doc;
    // The third section of the name holds the sample, which is no part.
    expect(templatePartSections(doc).map(({ part }) => part)).toEqual(['content', 'placeholder']);
    expect(doc.lastChild?.textContent).toContain('Specification');
    // A section the template lacks, or the document's tab, shows the sample and every section.
    for (const scope of ['missing', null]) {
      const all = templatePreviewDocument(TEMPLATE, undefined, { parts: true, scope });
      expect(all.sections.map((section) => section.name)[0]).toBeNull();
      expect(all.sections).toHaveLength(5);
    }
  });

  it('DOCE-TEMPLATES-8.6 shows each template section in parts, its content then its placeholder', () => {
    const template: TemplateFile = {
      ...TEMPLATE,
      sections: [
        ...(TEMPLATE.sections ?? []),
        { name: 'summary', placeholder: [paragraph('Summarise.')] },
      ],
    };
    const file = templatePreviewDocument(template, undefined, { parts: true });
    expect(file.sections.map((section) => section.name)).toEqual([
      null,
      'appendix',
      'appendix',
      'approvals',
      'approvals',
      'summary',
      'summary',
    ]);
    const doc = readDocumentFile(file, documentSchema).doc;
    const parts = templatePartSections(doc);
    expect(
      parts.map(({ section, part, content }) => [section.name, part, content.node.textContent]),
    ).toEqual([
      ['appendix', 'content', ''],
      ['appendix', 'placeholder', ''],
      ['approvals', 'content', 'Approved by'],
      ['approvals', 'placeholder', ''],
      ['summary', 'content', ''],
      ['summary', 'placeholder', 'Summarise.'],
    ]);
  });

  it('DOCE-TEMPLATES-8.6 writes a part into the template, taking inherited sections as its own', () => {
    const own: TemplateFile = { formatVersion: 1, id: 'child', parent: 'preview' };
    const content = [paragraph('Scope and purpose.')];
    const written = withTemplatePart(
      own,
      { section: 'appendix', part: 'content', content },
      TEMPLATE,
    );
    expect(written.sections).toEqual([
      { name: 'appendix', label: 'Appendix', content },
      TEMPLATE.sections?.[1],
    ]);
    const cleared = withTemplatePart(written, {
      section: 'appendix',
      part: 'content',
      content: [{ type: 'paragraph' }],
    });
    expect(cleared.sections?.[0]).toEqual({ name: 'appendix', label: 'Appendix' });
    expect(
      withTemplatePart(own, { section: 'missing', part: 'placeholder', content }, TEMPLATE),
    ).toBe(own);
  });

  it('DOCE-TEMPLATES-8.6 lets every section be edited in the preview, keeping the rest', () => {
    const locked: TemplateFile = {
      ...TEMPLATE,
      sections: [{ name: 'cover', label: 'Cover', editable: false }, { name: 'body' }],
    };
    expect(withEditableSections(locked).sections).toEqual([
      { name: 'cover', label: 'Cover' },
      { name: 'body' },
    ]);
    expect(withEditableSections(TEMPLATE)).toBe(TEMPLATE);
  });
});
