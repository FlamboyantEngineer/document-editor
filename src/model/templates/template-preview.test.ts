import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { readDocumentFile } from '../format/document-format-convert.js';
import type { TemplateFile } from '../format/template-format.js';
import { templatePreviewDocument } from './template-preview.js';

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
    const doc = readDocumentFile(file, documentSchema);
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
  });
});
