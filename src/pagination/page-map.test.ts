import type { Node } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { FRAGMENT_RULES } from '../model/index.js';
import { createPageMap, pageMap, showOnPages } from './page-map.js';
import { createProjectionMap } from './projection-map.js';

type Attrs = Record<string, unknown>;

function create(name: string, attrs: Attrs | null, content?: Node[] | string): Node {
  const type = documentSchema.nodes[name];
  if (!type) throw new Error(name);
  const children = typeof content === 'string' ? [documentSchema.text(content)] : content;
  return type.create(attrs, children);
}

const text = (value: string) => documentSchema.text(value);
const reference = (id: string) => create('footnote_reference', { footnoteId: id });
const entry = (id: string, value: string) => create('footnote_entry', { footnoteId: id }, value);
const paragraph = (attrs: Attrs | null, ...content: (Node | string)[]) =>
  create(
    'paragraph',
    attrs,
    content.map((part) => (typeof part === 'string' ? text(part) : part)),
  );
const cell = (name: 'table_cell' | 'table_header', value: string) =>
  create(name, null, [paragraph(null, value)]);
const row = (name: 'table_cell' | 'table_header', ...values: string[]) =>
  create(
    'table_row',
    null,
    values.map((value) => cell(name, value)),
  );
const table = (part: number, ...rows: Node[]) =>
  create('table', { dataId: 't1', splitPartIndex: part }, rows);

function page(blocks: Node[], entries: Node[] = []): Node {
  return create('page', null, [
    create('page_header', null),
    create('page_content', null, blocks),
    create('page_footnotes', null, entries),
    create('page_footer', null),
  ]);
}

const section = (name: string, ...pages: Node[]) =>
  create('page_section', { sectionName: name }, pages);

// Three pages in a first section: a paragraph split across the first break, and a table split
// across the second whose continuation repeats its header row; and one page in a second section.
const paged = create('doc', null, [
  section(
    'Body',
    page(
      [
        paragraph({ dataId: 'p0' }, 'Lead', reference('f1')),
        paragraph({ dataId: 'p1', splitPartIndex: 0 }, 'Split '),
      ],
      [entry('f1', 'One')],
    ),
    page(
      [
        paragraph({ dataId: 'p1', splitPartIndex: 1 }, 'across', reference('f2')),
        table(0, row('table_header', 'Name'), row('table_cell', 'Alpha')),
      ],
      [entry('f2', 'Two')],
    ),
    page([table(1, row('table_header', 'Name'), row('table_cell', 'Beta'))]),
  ),
  section('Annex', page([paragraph({ dataId: 'p9' }, 'Annexed')])),
]);

// The position just before the nth occurrence of some text, from 0.
function positionOf(doc: Node, value: string, nth = 0): number {
  const found: number[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    let index = node.text?.indexOf(value) ?? -1;
    while (index >= 0) {
      found.push(pos + index);
      index = node.text?.indexOf(value, index + 1) ?? -1;
    }
    return false;
  });
  const pos = found[nth];
  if (pos === undefined) throw new Error(value);
  return pos;
}

const textAt = (doc: Node, pos: number | null, length = 4) =>
  pos === null ? null : doc.textBetween(pos, pos + length);

describe('page map', () => {
  it('DOCE-PAGINATION-7.7 lists the pages in order, numbered through the document by section', () => {
    const map = createPageMap(paged);
    const pages = map.pages();
    expect(pages.map(({ number, section: index }) => [number, index])).toEqual([
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 1],
    ]);
    for (const each of pages) expect(paged.nodeAt(each.pos)).toBe(each.node);
  });

  it('DOCE-PAGINATION-7.7 finds the page holding a canonical position, either side of a break', () => {
    const map = createPageMap(paged);
    const { canonical } = map;
    expect(map.pageAt(positionOf(canonical, 'Lead'))?.number).toBe(1);
    expect(map.pageAt(positionOf(canonical, 'Beta'))?.number).toBe(3);
    expect(map.pageAt(positionOf(canonical, 'Annexed'))?.number).toBe(4);
    const across = positionOf(canonical, 'across');
    expect(map.pageAt(across)?.number).toBe(2);
    expect(map.pageAt(across, -1)?.number).toBe(1);
    expect(map.pageAt(positionOf(canonical, 'Two'))?.number).toBe(2);
    expect(map.pageAt(canonical.content.size)).toBeNull();
  });

  it('DOCE-PAGINATION-7.7 finds the first page holding an element', () => {
    const map = createPageMap(paged);
    expect(map.pageOf('p0')?.number).toBe(1);
    expect(map.pageOf('p1')?.number).toBe(1);
    expect(map.pageOf('t1')?.number).toBe(2);
    expect(map.pageOf('p9')?.number).toBe(4);
    expect(map.pageOf('missing')).toBeNull();
  });

  it('DOCE-PAGINATION-7.18 maps through the positions a projection keeps, joining no pages', () => {
    const kept = createProjectionMap(paged);
    const map = createPageMap(paged, FRAGMENT_RULES, kept);
    expect(map.canonical).toBe(kept.canonical);
    const across = positionOf(kept.canonical, 'across');
    expect(map.pageAt(across)?.number).toBe(2);
    expect(map.toProjection(across)).toBe(kept.toProjection(across));
    const other = createPageMap(
      paged.type.create(paged.attrs, paged.content),
      FRAGMENT_RULES,
      kept,
    );
    expect(other.canonical).not.toBe(kept.canonical);
    expect(other.canonical.eq(kept.canonical)).toBe(true);
  });

  it('DOCE-PAGINATION-7.18 keeps the pages a document was shown on with its positions', () => {
    const kept = createProjectionMap(paged);
    const state = EditorState.create({ doc: kept.canonical });
    showOnPages(state.doc, { pages: paged, rules: FRAGMENT_RULES, positions: kept });
    showOnPages(state.doc, {
      pages: paged.type.create(paged.attrs, paged.content),
      rules: FRAGMENT_RULES,
    });
    expect(pageMap(state).projection).toBe(paged);
    expect(pageMap(state).canonical).toBe(kept.canonical);
  });

  it('DOCE-PAGINATION-7.8 maps text exactly between the projection and the canonical document', () => {
    const map = createPageMap(paged);
    const { canonical } = map;
    expect(canonical.child(0).childCount).toBe(1);
    for (const value of ['Lead', 'Split', 'across', 'Alpha', 'Beta', 'Annexed']) {
      const pos = positionOf(paged, value);
      const mapped = map.toCanonical(pos);
      expect(textAt(canonical, mapped)).toBe(value.slice(0, 4));
      expect(map.toProjection(mapped ?? -1)).toBe(pos);
    }
  });

  it('DOCE-PAGINATION-7.8 keeps the end of a part to the text before the break', () => {
    const map = createPageMap(paged);
    const end = positionOf(paged, 'Split ') + 'Split '.length;
    const joint = positionOf(map.canonical, 'across');
    expect(map.toCanonical(end)).toBe(joint);
    expect(map.toProjection(joint, -1)).toBe(end);
    expect(map.toProjection(joint)).toBe(positionOf(paged, 'across'));
  });

  it('DOCE-PAGINATION-7.8 finds footnote entries and repeated header rows again', () => {
    const map = createPageMap(paged);
    const { canonical } = map;
    const two = positionOf(paged, 'Two') + 1;
    const canonicalTwo = map.toCanonical(two);
    expect(textAt(canonical, canonicalTwo, 2)).toBe('wo');
    expect(map.toProjection(canonicalTwo ?? -1)).toBe(two);
    const repeated = positionOf(paged, 'Name', 1) + 2;
    expect(map.toCanonical(repeated)).toBe(positionOf(canonical, 'Name') + 2);
  });

  it("DOCE-PAGINATION-7.7 reads a state's page map once per document", () => {
    const state = EditorState.create({ doc: paged });
    expect(pageMap(state)).toBe(pageMap(state));
    expect(pageMap(state).canonical.child(0).child(0).child(1).childCount).toBe(3);
  });
});
