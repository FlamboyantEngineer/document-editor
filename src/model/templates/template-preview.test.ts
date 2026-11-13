import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { readDocumentFile } from '../format/document-format-convert.js';
import type { TemplateFile } from '../format/template-format.js';
import {
  templatePartSections,
  templatePreviewDocument,
  withEditableSections,
  withTemplatePart,
} from './template-preview.js';

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
