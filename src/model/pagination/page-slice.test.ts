import type { Node, Slice } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { contentSlice } from '../index.js';

type Attrs = Record<string, unknown>;
const { nodes } = documentSchema;

function create(name: string, attrs: Attrs | null, content?: Node[] | string): Node {
  const type = nodes[name];
  if (!type) throw new Error(name);
  const children = typeof content === 'string' ? [documentSchema.text(content)] : content;
  return type.create(attrs, children);
}

const paragraph = (text: string, attrs: Attrs | null = null) => create('paragraph', attrs, text);

function page(blocks: Node[], chrome: { header?: string; footer?: string } = {}): Node {
  return create('page', null, [
    create('page_header', null, chrome.header ? [paragraph(chrome.header)] : []),
    create('page_content', null, blocks),
    create('page_footnotes', null),
    create('page_footer', null, chrome.footer ? [paragraph(chrome.footer)] : []),
  ]);
}

const paged = (...pages: Node[]) =>
  create('doc', null, [create('page_section', { sectionName: 'Body' }, pages)]);

function positionOf(document: Node, text: string): number {
  let found = -1;
  document.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text?.includes(text)) {
      found = pos + (node.text.indexOf(text) || 0);
    }
    return found < 0;
  });
  if (found < 0) throw new Error(text);
  return found;
}

const typesIn = (slice: Slice) => {
  const names = new Set<string>();
  slice.content.descendants((node) => {
    names.add(node.type.name);
  });
  return [...names];
};

describe('a slice of pages', () => {
  it('DOCE-PAGINATION-7.11 takes a slice that crosses pages as the blocks of their content', () => {
    const document = paged(
      page([paragraph('Alpha'), paragraph('Beta two')], { footer: 'Foot' }),
      page([paragraph('Gamma three'), paragraph('Delta')], { header: 'Head' }),
    );
    const from = positionOf(document, 'two');
    const to = positionOf(document, 'three') - 1;
    const slice = contentSlice(document.slice(from, to));
    expect(typesIn(slice)).toEqual(['paragraph', 'text']);
    expect(slice.content.textBetween(0, slice.content.size, '|')).toBe('two|Gamma');
    expect([slice.openStart, slice.openEnd]).toEqual([1, 1]);
  });

  it('DOCE-PAGINATION-7.11 joins the parts of a block split across the pages of a slice', () => {
    const split = (index: number, text: string) =>
      paragraph(text, { dataId: 'aaaaaaaa', splitPartIndex: index });
    const document = paged(
      page([paragraph('Alpha'), split(0, 'One two ')]),
      page([split(1, 'three four'), paragraph('Omega')]),
    );
    const slice = contentSlice(document.slice(0, document.content.size));
    expect(slice.content.childCount).toBe(3);
    expect(slice.content.textBetween(0, slice.content.size, '|')).toBe(
      'Alpha|One two three four|Omega',
    );
    expect(slice.content.child(1).attrs.splitPartIndex).toBeNull();
    expect([slice.openStart, slice.openEnd]).toEqual([0, 0]);
  });

  it('DOCE-PAGINATION-7.11 leaves a slice of one page a section as it is', () => {
    const document = paged(page([paragraph('Alpha one'), paragraph('Beta two')]));
    const slice = document.slice(positionOf(document, 'one'), positionOf(document, 'two'), true);
    expect(contentSlice(slice)).toBe(slice);
    const blocks = document.slice(positionOf(document, 'one'), positionOf(document, 'two'), false);
    expect(contentSlice(blocks)).toBe(blocks);
  });
});
