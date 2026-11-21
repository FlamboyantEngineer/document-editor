import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { readRegressionDocument, readRegressionTemplate } from '../../../test/stored-fixtures.js';
import { readDocumentFile, type StoredNode, type TemplateFile } from '../../model/index.js';
import { createDocumentSchema } from '../../model/schema/document-schema.js';
import { BASE_TEMPLATE } from '../../model/templates/base-template.js';
import { blockNumbers } from './numbers.js';

const schema = createDocumentSchema();

const text = (value: string): StoredNode => ({ type: 'text', text: value });
const paragraph = (value: string): StoredNode => ({ type: 'paragraph', content: [text(value)] });
const item = (value: string): StoredNode => ({ type: 'listItem', content: [paragraph(value)] });

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
    const numbers = blockNumbers(doc, template);
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
    const numbers = blockNumbers(doc, BASE_TEMPLATE);
    expect(shown(doc, numbers.labelOf)).toEqual(['Figure 1 - ', 'Figure 2 - ']);
  });
});

describe('list markers', () => {
  const ordered = (order: number, ...items: StoredNode[]): StoredNode => ({
    type: 'orderedList',
    attrs: { start: order },
    content: items,
  });

  it('DOCE-PAGINATION-10.7 numbers ordered items from the list’s start, each list on its own', () => {
    const nested = ordered(1, item('a'), item('b'));
    const doc = documentOf([
      ordered(3, { type: 'listItem', content: [paragraph('x'), nested] }, item('y')),
      { type: 'bulletList', content: [item('z')] },
    ]);
    const numbers = blockNumbers(doc, BASE_TEMPLATE);
    expect(shown(doc, numbers.markerOf)).toEqual(['3. ', '1. ', '2. ', '4. ']);
  });

  it('DOCE-PAGINATION-10.7 takes the template’s list format, prefix and suffix', () => {
    const template: TemplateFile = {
      ...BASE_TEMPLATE,
      styles: { ...BASE_TEMPLATE.styles, list: { format: 'a)', prefix: '(', suffix: ':' } },
    };
    const doc = documentOf([ordered(1, item('a'), item('b'))]);
    expect(shown(doc, blockNumbers(doc, template).markerOf)).toEqual(
      ['(a):', '(b):'].map((m) => `${m} `),
    );
  });
});

describe('footnote numbers', () => {
  it('DOCE-PAGINATION-10.7 numbers footnotes in the order they are first cited', () => {
    const note = (id: string): StoredNode => ({
      type: 'footnote',
      attrs: { id },
      content: [text(`note ${id}`)],
    });
    const doc = documentOf([
      { type: 'paragraph', content: [text('One'), note('n1'), text(' two'), note('n2')] },
    ]);
    const numbers = blockNumbers(doc, BASE_TEMPLATE);
    const markers = shown(doc, (node) =>
      node.type.name === 'footnote_reference' ? numbers.footnoteOf(node) : undefined,
    );
    expect(markers).toEqual(['1', '2']);
  });
});
