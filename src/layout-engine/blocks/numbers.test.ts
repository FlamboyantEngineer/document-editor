import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { readRegressionDocument, readRegressionTemplate } from '../../../test/stored-fixtures.js';
import { readDocumentFile, type StoredNode } from '../../model/index.js';
import { splitHeldWith } from '../../model/pagination/held-split.js';
import { splitCode } from '../../model/pagination/text-split.js';
import { createDocumentSchema } from '../../model/schema/document-schema.js';
import { BASE_TEMPLATE } from '../../model/templates/base-template.js';
import { captionNumbers } from './numbers.js';

const schema = createDocumentSchema();

const text = (value: string): StoredNode => ({ type: 'text', text: value });

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

  it("DOCE-PAGINATION-11.2 labels a later part's caption, made again by a split, as the caption it repeats", () => {
    const doc = documentOf([
      {
        type: 'codeBlock',
        attrs: { id: 'k1' },
        content: [{ type: 'caption', content: [text('Listing')] }, text('a\nb\nc')],
      },
    ]);
    const numbers = captionNumbers(doc, BASE_TEMPLATE);
    let figure: ProseMirrorNode | undefined;
    doc.descendants((node) => {
      if (node.type.name === 'code_figure') figure = node;
      return !figure;
    });
    if (!figure) throw new Error('no code figure');
    const block = { node: figure, height: 100, marginTop: 0, marginBottom: 0 };
    const measure = (from: number, to: number) => ({ height: (to - from) * 10, lines: 1 });
    const split = splitHeldWith(splitCode)(
      { ...block, measurement: { offset: 0, measure, overhead: 40 } },
      70,
    );
    const later = split?.tail[0]?.node.firstChild;
    if (!later) throw new Error('no later part');
    expect(numbers.labelOf(later)).toBe(numbers.labelOf(figure.firstChild as ProseMirrorNode));
    expect(numbers.labelOf(later)).toBe('Code Block 1 - ');
  });
});
