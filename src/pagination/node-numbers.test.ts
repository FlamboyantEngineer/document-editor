import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import { createDocumentSchema } from '../model/schema/document-schema.js';
import { BASE_TEMPLATE } from '../model/templates/base-template.js';
import { numbersByNode } from './node-numbers.js';

const schema = createDocumentSchema();
const text = (value: string): StoredNode => ({ type: 'text', text: value });
const note = (id: string): StoredNode => ({
  type: 'footnote',
  attrs: { id },
  content: [text(`note ${id}`)],
});

function documentOf(content: StoredNode[]): ProseMirrorNode {
  return readDocumentFile({ formatVersion: 1, sections: [{ name: null, content }] }, schema).doc;
}

describe('numbersByNode', () => {
  it('DOCE-PAGINATION-10.7 numbers footnotes in the order they are first cited', () => {
    const doc = documentOf([
      { type: 'paragraph', content: [text('One'), note('n1'), text(' two'), note('n2')] },
    ]);
    const { footnoteOf } = numbersByNode(doc, BASE_TEMPLATE).byNode;
    const markers: (string | undefined)[] = [];
    doc.descendants((node) => {
      if (node.type.name === 'footnote_reference') markers.push(footnoteOf(node));
      return true;
    });
    expect(markers).toEqual(['1', '2']);
  });
});
