import { describe, expect, it } from 'vitest';
import { blockBuilders, standInBlockLayout } from '../../../test/layout-engine-fixtures.js';
import {
  type ContainerMeasurement,
  isTextMeasurement,
  type LayoutBlock,
} from '../../model/index.js';
import { createDocumentSchema } from '../../model/schema/document-schema.js';
import type { BlockGeometry } from './types.js';

const schema = createDocumentSchema();
const { node, paragraph, heading, item, list } = blockBuilders(schema);
const { layout } = standInBlockLayout();
const place = { width: 600 };

function blockOf(geometry: BlockGeometry): LayoutBlock {
  if (!geometry.ok) throw new Error(geometry.reason);
  return geometry.block;
}

const childrenOf = (block: LayoutBlock) =>
  (block.measurement as ContainerMeasurement).children.map(({ top, bottom }) => [top, bottom]);

describe('text blocks', () => {
  it('DOCE-PAGINATION-10.3 takes a paragraph’s lines and margins from the text layout', () => {
    // 600px holds 100 characters a line: 250 characters take three lines of 18px.
    const block = blockOf(layout.layoutBlock(paragraph(250), place));
    expect(block).toMatchObject({ height: 54, marginTop: 0, marginBottom: 8 });
    expect(isTextMeasurement(block.measurement)).toBe(true);
    if (!isTextMeasurement(block.measurement)) return;
    expect(block.measurement.measure(0, 250)).toEqual({ height: 54, lines: 3 });
    expect(block.measurement.measure(0, 100)).toEqual({ height: 18, lines: 1 });
    expect(block.measurement.measure(150, 250)).toEqual({ height: 36, lines: 2 });
  });

  it('DOCE-PAGINATION-10.3 takes no margins in a header or a footer', () => {
    const block = blockOf(layout.layoutBlock(heading(10), { width: 600, region: 'footer' }));
    expect(block).toMatchObject({ height: 26, marginTop: 0, marginBottom: 0 });
  });

  it('DOCE-PAGINATION-10.3 names what it cannot lay out', () => {
    const contents = node('toc_block', null);
    expect(layout.layoutBlock(contents, place)).toEqual({
      ok: false,
      node: contents,
      reason: 'toc_block is not laid out by the engine yet',
    });
    expect(layout.layoutBlock(paragraph(5), { width: 0 })).toMatchObject({ ok: false });
    const { layout: refusing } = standInBlockLayout({ refuse: ['heading'] });
    const titled = list(item(paragraph(5)), item(paragraph(5), heading(3)));
    const result = refusing.layoutBlock(titled, place);
    expect(result).toMatchObject({ ok: false, reason: 'heading is not supported by the stand-in' });
    expect(!result.ok && result.node.type.name).toBe('heading');
  });
});

describe('lists', () => {
  it('DOCE-PAGINATION-10.3 stacks items indented, their paragraphs without margins', () => {
    // 568px after the 32px indentation holds 94 characters a line.
    const block = blockOf(
      layout.layoutBlock(list(item(paragraph(50)), item(paragraph(150))), place),
    );
    expect(block).toMatchObject({ height: 18 + 36, marginTop: 0, marginBottom: 8 });
    expect(childrenOf(block)).toEqual([
      [0, 18],
      [18, 54],
    ]);
  });

  it('DOCE-PAGINATION-10.3 lets a nested list’s margin through its item, except at the list’s end', () => {
    const nested = list(item(paragraph(10)));
    const block = blockOf(
      layout.layoutBlock(list(item(paragraph(10), nested), item(paragraph(10))), place),
    );
    // The nested list's 8px bottom margin parts the items; it ends no last item.
    expect(childrenOf(block)).toEqual([
      [0, 36],
      [44, 62],
    ]);
    const last = blockOf(layout.layoutBlock(list(item(paragraph(10), nested)), place));
    expect(last).toMatchObject({ height: 36, marginBottom: 8 });
    const items = (last.measurement as ContainerMeasurement).children;
    expect((items[0]?.measurement as ContainerMeasurement).overhead).toBe(0);
  });

  it('DOCE-PAGINATION-10.3 passes a last block’s margin out of an item but keeps a checklist item’s in', () => {
    const plain = blockOf(
      layout.layoutBlock(list(item(paragraph(10), heading(10)), item(paragraph(10))), place),
    );
    // The heading's 10px bottom margin parts the items.
    expect(childrenOf(plain)).toEqual([
      [0, 18 + 20 + 26],
      [74, 92],
    ]);
    const task = node('list_item', { checked: false }, [paragraph(10), heading(10)]);
    const checked = blockOf(layout.layoutBlock(list(task, item(paragraph(10))), place));
    expect(childrenOf(checked)).toEqual([
      [0, 74],
      [74, 92],
    ]);
  });
});

describe('quotes and plain containers', () => {
  it('DOCE-PAGINATION-10.3 indents a quote 40px on each side, with margins of 1em in the paragraph size', () => {
    // 520px holds 86 characters a line.
    const quote = node('blockquote', null, [paragraph(50), paragraph(100)]);
    const block = blockOf(layout.layoutBlock(quote, place));
    // The base template's 12px paragraphs: 12px margins, as the browser's `1em`.
    expect(block).toMatchObject({ height: 18 + 8 + 36, marginTop: 12, marginBottom: 12 });
    expect(childrenOf(block)).toEqual([
      [0, 18],
      [26, 62],
    ]);
  });

  it('DOCE-PAGINATION-10.3 lays out an embed’s content and keeps an empty script block’s line and a half', () => {
    const embed = node('embed', { kind: 'note' }, [paragraph(10), paragraph(10)]);
    expect(blockOf(layout.layoutBlock(embed, place))).toMatchObject({
      height: 44,
      marginBottom: 8,
    });
    // The base template's 12px text: 18px.
    expect(blockOf(layout.layoutBlock(node('script_block', null), place))).toMatchObject({
      height: 18,
      marginTop: 0,
      marginBottom: 0,
    });
  });
});

describe('layout sections', () => {
  it('DOCE-PAGINATION-10.3 sets columns side by side, each as tall as the tallest', () => {
    const column = (...content: ReturnType<typeof paragraph>[]) =>
      node('layout_column', null, content);
    // Two 298px columns, 286px inside their padding and border: 47 characters a line.
    const section = node('layout_section', { preset: 'halves' }, [
      column(paragraph(10), paragraph(10)),
      column(paragraph(100)),
    ]);
    const block = blockOf(layout.layoutBlock(section, place));
    expect(block).toMatchObject({ height: 66, marginTop: 0, marginBottom: 4 });
    expect(childrenOf(block)).toEqual([
      [0, 66],
      [0, 66],
    ]);
    const columns = (block.measurement as ContainerMeasurement).children;
    expect(columns[0]?.measurement).toMatchObject({ overhead: 12 });
    expect(childrenOf({ ...block, measurement: columns[0]?.measurement })).toEqual([
      [0, 18],
      [26, 44],
    ]);
  });

  it('DOCE-PAGINATION-10.3 gives a third and two thirds by the preset', () => {
    const column = node('layout_column', null, [paragraph(100)]);
    const section = node('layout_section', { preset: 'third-two-thirds' }, [column, column]);
    // 596px shared 1:2: 198.67px and 397.33px, 186.67px (31 characters a line) and 385.33px inside.
    const block = blockOf(layout.layoutBlock(section, place));
    expect(block.height).toBe(4 * 18 + 12);
  });
});
