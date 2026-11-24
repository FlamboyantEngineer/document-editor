import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { readRegressionDocument, readRegressionTemplate } from '../../test/stored-fixtures.js';
import { catalogDocument, readDocumentFile, type StoredNode } from '../model/index.js';
import { createDocumentSchema } from '../model/schema/document-schema.js';
import { BASE_TEMPLATE } from '../model/templates/base-template.js';
import { objectNumbers } from './engine-numbers.js';
import { holdNodeNumbers } from './node-numbers.js';

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

describe('holdNodeNumbers', () => {
  it('DOCE-PAGINATION-10.7 numbers footnotes in the order they are first cited', () => {
    const doc = documentOf([
      { type: 'paragraph', content: [text('One'), note('n1'), text(' two'), note('n2')] },
    ]);
    const numbers = holdNodeNumbers(BASE_TEMPLATE);
    numbers.number(doc);
    const { footnoteOf } = numbers.current();
    const markers: (string | undefined)[] = [];
    doc.descendants((node) => {
      if (node.type.name === 'footnote_reference') markers.push(footnoteOf(node));
      return true;
    });
    expect(markers).toEqual(['1', '2']);
  });

  it('DOCE-PAGINATION-12.10 gives each display equation the automatic number the pages draw, in its block key', () => {
    const file = readRegressionDocument('caption-numbering');
    const template = readRegressionTemplate(file.template?.id ?? 'regression-base');
    const { doc } = readDocumentFile(file, schema);
    const equations: ProseMirrorNode[] = [];
    doc.descendants((node) => {
      if (node.type.name === 'math_display') equations.push(node);
    });
    const numbers = holdNodeNumbers(template);
    numbers.number(doc);
    const byNode = numbers.current();
    const drawn = [...objectNumbers(doc, template).equations.values()];
    expect(equations.map((node) => byNode.equationOf(node) ?? '')).toEqual(drawn);
    expect(drawn.slice(0, 2)).toEqual(['(Eq. i)', '(Eq. 1.1)']);
    const [, second] = equations;
    if (!second) throw new Error('fewer than two equations');
    expect(byNode.keyOf(second)).toMatch(/\|\(Eq\. 1\.1\)$/u);
    expect(byNode.equationOf(doc.child(0))).toBeUndefined();
  });

  it('DOCE-PAGINATION-12.10 measures equations before and after the first contents by position', () => {
    const doc = documentOf([
      { type: 'mathBlock', attrs: { source: 'x' } },
      { type: 'contents', attrs: { kind: 'toc' } },
      { type: 'mathBlock', attrs: { source: 'y' } },
    ]);
    const numbers = holdNodeNumbers(BASE_TEMPLATE);
    numbers.number(doc);
    const drawn = objectNumbers(doc, BASE_TEMPLATE).equations;
    expect([...drawn.values()]).toHaveLength(2);
    const measured = [...drawn].map(([pos, label]) => {
      const node = doc.nodeAt(pos);
      if (!node) throw new Error('An equation has no position');
      expect(numbers.current().equationOf(node)).toBe(label);
      expect(numbers.current().keyOf(node)).toContain(label);
      return label;
    });
    expect(new Set(measured).size).toBe(2);
    // The contents list still omits front matter without changing the measured numbers.
    expect(catalogDocument(doc, BASE_TEMPLATE).equations?.map(({ number }) => number)).toEqual([
      measured[1],
    ]);
  });
});
