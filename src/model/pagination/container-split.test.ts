import type { Node } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import {
  type ChildLayout,
  createLayoutRules,
  joinFragments,
  LAYOUT_RULES,
  type LayoutBlock,
  layoutNextPage,
  splitContainer,
  type SplitContext,
  splitLayoutSection,
  splitList,
  splitListItem,
  splitTableWith,
  type TextMeasurement,
} from '../index.js';

const context: SplitContext = {
  pageIndex: 0,
  pageHeight: 100,
  remainingHeight: 100,
  rules: LAYOUT_RULES,
  context: null,
};

const node = (name: string, attrs: Record<string, unknown> | null, content: Node[] = []) =>
  documentSchema.node(name, attrs, content);
const paragraph = (text: string, attrs: Record<string, unknown> | null = null) =>
  node('paragraph', attrs, [documentSchema.text(text)]);
const item = (id: string, children: Node[]) => node('list_item', { dataId: id }, children);
const rows = (count: number, height: number, from = 0): ChildLayout[] =>
  Array.from({ length: count }, (_, index) => ({
    top: from + index * height,
    bottom: from + (index + 1) * height,
  }));

function measured(block: Node, height: number, children: ChildLayout[]): LayoutBlock {
  return { node: block, height, marginTop: 0, marginBottom: 0, measurement: { children } };
}

// Two words to a ten-pixel line, as in the text split tests.
const lines = (offset = 0): TextMeasurement => ({
  offset,
  measure: (from, to) => {
    const count = Math.max(1, Math.ceil((to - from) / 8));
    return { height: count * 10, lines: count };
  },
});
const words = (count: number) =>
  Array.from({ length: count }, (_, index) => `w${String(index).padStart(2, '0')}`).join(' ');

describe('container splits', () => {
  it('DOCE-PAGINATION-4.1 splits a list between items, the second part numbering on', () => {
    const list = node('ordered_list', { dataId: 'l1', order: 1 }, [
      item('i1', [paragraph('One')]),
      item('i2', [paragraph('Two')]),
      item('i3', [paragraph('Three')]),
      item('i4', [paragraph('Four')]),
    ]);
    const split = splitList(measured(list, 80, rows(4, 20)), 50, context);
    expect(split?.head).toMatchObject({ height: 40 });
    expect(split?.head.node.childCount).toBe(2);
    expect(split?.tail[0]).toMatchObject({ height: 40, breakBefore: true });
    expect(split?.tail[0]?.node.attrs).toMatchObject({ order: 3, splitPartIndex: 1 });
    expect(split?.tail[0]?.measurement).toEqual({ children: rows(2, 20), overhead: 0 });
    expect(splitList(measured(list, 80, rows(4, 20)), 90, context)).toBeNull();
  });

  it('DOCE-PAGINATION-4.2 splits a list through the item and paragraph that cross the page foot', () => {
    const text = words(10);
    const list = node('bullet_list', { dataId: 'l1' }, [
      item('i1', [paragraph('One')]),
      item('i2', [paragraph(text, { dataId: 'p2' })]),
    ]);
    const itemMeasurement = { children: [{ top: 0, bottom: 50, measurement: lines() }] };
    const block = measured(list, 70, [
      { top: 0, bottom: 20 },
      { top: 20, bottom: 70, measurement: itemMeasurement },
    ]);
    const split = splitList(block, 52, context);
    const tail = split?.tail[0];
    expect(split?.head.height).toBe(40);
    expect(split?.head.node.lastChild?.textContent).toBe('w00 w01 w02 w03 ');
    expect(tail?.height).toBe(30);
    expect(tail?.node.firstChild?.attrs).toMatchObject({
      orphanedListContinuation: true,
      splitPartIndex: 1,
    });
    const [joined] = joinFragments(
      [split?.head.node, tail?.node].filter((part): part is Node => Boolean(part)),
    );
    expect(joined?.textContent).toBe(`One${text}`);
  });

  it('DOCE-PAGINATION-4.3 opens a list item continuation that starts with another block with an empty paragraph', () => {
    const nested = node('bullet_list', null, [item('n1', [paragraph('Nested')])]);
    const listItem = item('i1', [paragraph('Lead'), nested]);
    const split = splitListItem(
      measured(listItem, 60, [
        { top: 0, bottom: 20 },
        { top: 20, bottom: 60 },
      ]),
      30,
      context,
    );
    const tail = split?.tail[0]?.node;
    expect(tail?.firstChild).toMatchObject({ type: { name: 'paragraph' } });
    expect(tail?.firstChild?.content.size).toBe(0);
    expect(tail?.attrs.orphanedListContinuation).toBe(true);
    const [joined] = joinFragments(
      [split?.head.node, tail].filter((part): part is Node => Boolean(part)),
    );
    expect(joined?.childCount).toBe(2);
  });

  it('DOCE-PAGINATION-4.4 splits a quote between its blocks', () => {
    const quote = node('blockquote', { dataId: 'q1' }, [
      paragraph('A'),
      paragraph('B'),
      paragraph('C'),
    ]);
    const split = splitContainer(measured(quote, 64, rows(3, 20, 2)), 45, context);
    expect(split?.head.node.childCount).toBe(2);
    expect(split?.head.height).toBe(42);
    expect(split?.tail[0]).toMatchObject({ height: 22 });
  });

  it('DOCE-PAGINATION-4.5 splits a table between body rows, repeating its header rows when asked', () => {
    const row = (cell: string, text: string) =>
      node('table_row', null, [node(cell, null, [paragraph(text)])]);
    const table = node('table', { dataId: 't1' }, [
      row('table_header', 'Name'),
      row('table_cell', 'One'),
      row('table_cell', 'Two'),
      row('table_cell', 'Three'),
    ]);
    const layouts = [{ top: 0, bottom: 10 }, ...rows(3, 20, 10)];
    const repeated = splitTableWith(true)(measured(table, 75, layouts), 40);
    expect(repeated?.head).toMatchObject({ height: 35 });
    expect(repeated?.tail[0]?.node.textContent).toBe('NameTwoThree');
    expect(repeated?.tail[0]?.height).toBe(55);
    const plain = splitTableWith(false)(measured(table, 75, layouts), 40);
    expect(plain?.tail[0]?.node.textContent).toBe('TwoThree');
    expect(plain?.tail[0]?.height).toBe(45);
    for (const split of [repeated, plain]) {
      const [joined] = joinFragments(
        [split?.head.node, split?.tail[0]?.node].filter((part): part is Node => Boolean(part)),
      );
      expect(joined?.textContent).toBe('NameOneTwoThree');
    }
    const short = node('table', null, [row('table_header', 'Name'), row('table_cell', 'One')]);
    expect(splitTableWith(true)(measured(short, 35, layouts.slice(0, 2)), 20)).toBeNull();
    expect(createLayoutRules({ repeatTableHeader: false }).table?.split).toBeTypeOf('function');
  });
});

describe('script block and layout section splits', () => {
  const column = (id: string, children: Node[]) => node('layout_column', { dataId: id }, children);
  const parts = (split: ReturnType<typeof splitContainer>) =>
    [split?.head.node, ...(split?.tail.map((part) => part.node) ?? [])].filter(
      (part): part is Node => Boolean(part),
    );

  it('DOCE-PAGINATION-4.6 splits a script block’s output between and through its blocks, and joins it back', () => {
    const text = words(10);
    const script = node('script_block', { dataId: 's1', script: 'report()' }, [
      paragraph('Lead', { dataId: 'p1' }),
      paragraph(text, { dataId: 'p2' }),
    ]);
    const block = {
      ...measured(script, 74, [
        { top: 0, bottom: 20 },
        { top: 20, bottom: 70, measurement: lines() },
      ]),
      measurement: {
        children: [
          { top: 0, bottom: 20 },
          { top: 20, bottom: 70, measurement: lines() },
        ],
        overhead: 4,
      },
    };
    const through = LAYOUT_RULES.script_block?.split?.(block, 46, context) ?? null;
    expect(through?.head.height).toBe(44);
    expect(through?.head.node.lastChild?.textContent).toBe('w00 w01 w02 w03 ');
    expect(through?.tail[0]).toMatchObject({ height: 34, breakBefore: true });
    expect(through?.tail[0]?.node.attrs).toMatchObject({ script: 'report()', splitPartIndex: 1 });
    const [joined] = joinFragments(parts(through));
    expect(joined?.eq(script)).toBe(true);
    const between = splitContainer(block, 30, context);
    expect(between?.head.node.childCount).toBe(1);
    expect(joinFragments(parts(between))[0]?.eq(script)).toBe(true);
    expect(LAYOUT_RULES.script_block?.keepsWithHeading).toBe(true);
  });

  it('DOCE-PAGINATION-4.7 splits a layout section by splitting every column at one height', () => {
    const section = node('layout_section', { dataId: 'ls1', preset: 'halves' }, [
      column('c1', [paragraph('A', { dataId: 'a' }), paragraph('B', { dataId: 'b' })]),
      column('c2', [
        paragraph('C', { dataId: 'c' }),
        paragraph('D', { dataId: 'd' }),
        paragraph('E', { dataId: 'e' }),
        paragraph('F', { dataId: 'f' }),
      ]),
    ]);
    const columnLayout = (count: number) => ({
      top: 0,
      bottom: count * 20 + 10,
      measurement: { children: rows(count, 20), overhead: 10 },
    });
    const block = measured(section, 90, [columnLayout(2), columnLayout(4)]);
    const split = splitLayoutSection(block, 55, context);
    const tail = split?.tail[0];
    expect(split?.head.node.child(0).childCount).toBe(2);
    expect(split?.head.node.child(1).textContent).toBe('CD');
    expect(split?.head.height).toBe(50);
    expect(tail).toMatchObject({ height: 50, breakBefore: true });
    expect(tail?.node.attrs).toMatchObject({ preset: 'halves', splitPartIndex: 1 });
    expect(tail?.node.child(0).textContent).toBe('');
    expect(tail?.node.child(1).textContent).toBe('EF');
    expect(joinFragments(parts(split))[0]?.eq(section)).toBe(true);
    expect(splitLayoutSection(block, 15, context)).toBeNull();
    expect(LAYOUT_RULES.layout_section?.keepsWithHeading).toBe(true);
  });

  it('DOCE-PAGINATION-4.7 splits a layout column through a paragraph and joins it back', () => {
    const text = words(10);
    const section = node('layout_section', { dataId: 'ls1' }, [
      column('c1', [paragraph(text, { dataId: 'p1' })]),
      column('c2', [paragraph('Side', { dataId: 'p2' })]),
    ]);
    const block = measured(section, 50, [
      {
        top: 0,
        bottom: 50,
        measurement: { children: [{ top: 0, bottom: 50, measurement: lines() }] },
      },
      { top: 0, bottom: 20, measurement: { children: rows(1, 20) } },
    ]);
    const split = splitLayoutSection(block, 32, context);
    expect(split?.head.node.child(0).textContent).toBe('w00 w01 w02 w03 w04 w05 ');
    expect(split?.head.node.child(1).textContent).toBe('Side');
    expect(joinFragments(parts(split))[0]?.eq(section)).toBe(true);
  });

  it('DOCE-PAGINATION-4.7 keeps a column block taller than a page whole on the page after the split', () => {
    const section = node('layout_section', { dataId: 'ls1', preset: 'halves' }, [
      column('c1', [paragraph('Side', { dataId: 'p1' })]),
      column('c2', [node('heading', { dataId: 'h1', level: 2 }, [documentSchema.text('Tall')])]),
    ]);
    const block = measured(section, 500, [
      { top: 0, bottom: 20, measurement: { children: rows(1, 20) } },
      { top: 0, bottom: 500, measurement: { children: rows(1, 500) } },
    ]);
    // A layout that kept splitting off the empty paragraphs would never end, so two pages are
    // laid out by hand.
    const queue = [block];
    const pages = [0, 1].map((index) => layoutNextPage(queue, index, { pageHeight: 100 }));
    expect(queue).toHaveLength(0);
    expect(pages.map((page) => page.map((each) => each.node.textContent))).toEqual([
      ['Side'],
      ['Tall'],
    ]);
    expect(joinFragments(pages.flat().map((each) => each.node))[0]?.eq(section)).toBe(true);
  });
});
