import type { Node } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import {
  type ChildLayout,
  createLayoutRules,
  joinFragments,
  LAYOUT_RULES,
  type LayoutBlock,
  splitBlockquote,
  type SplitContext,
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
    expect(split?.tail[0]?.measurement).toEqual({ children: rows(2, 20) });
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
    const split = splitBlockquote(measured(quote, 64, rows(3, 20, 2)), 45, context);
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
