import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { readRegressionDocument, readRegressionTemplate } from '../../../test/stored-fixtures.js';
import { readDocumentFile, type StoredNode } from '../../model/index.js';
import { createDocumentSchema } from '../../model/schema/document-schema.js';
import { BASE_TEMPLATE } from '../../model/templates/base-template.js';
import { captionNumbers } from './numbers.js';

const schema = createDocumentSchema();

const text = (value: string): StoredNode => ({ type: 'text', text: value });
const paragraph = (value: string): StoredNode => ({ type: 'paragraph', content: [text(value)] });

function documentOf(content: StoredNode[]): ProseMirrorNode {
  return readDocumentFile({ formatVersion: 1, sections: [{ name: null, content }] }, schema).doc;
}

function shown(doc: ProseMirrorNode, read: (node: ProseMirrorNode) => string | undefined) {
  const found: string[] = [];
  doc.descendants((node) => {
    const value = read(node);
    if (value !== undefined) found.push(value);
    return true;
  });
  return found;
}

describe('caption labels', () => {
  it('DOCE-PAGINATION-10.7 labels each shown caption as its counter would, by kind and heading', () => {
    const file = readRegressionDocument('caption-numbering');
    const template = readRegressionTemplate(file.template?.id ?? 'regression-base');
    const { doc } = readDocumentFile(file, schema);
    const numbers = captionNumbers(doc, template);
    expect(shown(doc, numbers.labelOf).slice(1, 7)).toEqual([
      'Figure 1.1 - ',
      'Table 1.1 - ',
      'Code Block 1.1 - ',
      'Figure 1.2 - ',
      'Table 1.2 - ',
      'Code Block 1.2 - ',
    ]);
  });

  it('DOCE-PAGINATION-10.7 gives a hidden caption no label and counts it out', () => {
    const figure = (captionEnabled: boolean): StoredNode => ({
      type: 'figure',
      attrs: { src: 'https://example.org/a.png', captionEnabled },
      content: [{ type: 'figure_caption', content: [text('A view')] }],
    });
    const doc = documentOf([figure(true), figure(false), figure(true)]);
    const numbers = captionNumbers(doc, BASE_TEMPLATE);
    expect(shown(doc, numbers.labelOf)).toEqual(['Figure 1 - ', 'Figure 2 - ']);
  });
});
