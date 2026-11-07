// Splits a table between its body rows. The editor measures where each row sits; the second part
// repeats the leading header rows when the template asks for it.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type ChildLayout, isContainerMeasurement } from './container-split.js';
import type { LayoutBlock, SplitBlock } from './page-layout.js';

function rowsOf(table: ProseMirrorNode): ProseMirrorNode[] {
  const rows: ProseMirrorNode[] = [];
  table.forEach((row) => rows.push(row));
  return rows;
}

/** Whether every cell of a row is a header cell. */
export function isHeaderRow(row: ProseMirrorNode): boolean {
  let header = row.childCount > 0;
  row.forEach((cell) => {
    if (cell.type.name !== 'table_header') header = false;
  });
  return header;
}

/** How many of a table's rows lead it as header rows. */
export function leadingHeaderRows(table: ProseMirrorNode): number {
  const rows = rowsOf(table);
  const count = rows.findIndex((row) => !isHeaderRow(row));
  return count < 0 ? rows.length : count;
}

function partIndex(node: ProseMirrorNode): number {
  const index = node.attrs.splitPartIndex as unknown;
  return typeof index === 'number' && Number.isInteger(index) && index >= 0 ? index : 0;
}

function shift(layouts: readonly ChildLayout[], by: number): ChildLayout[] {
  return layouts.map((layout) => ({ ...layout, top: layout.top - by, bottom: layout.bottom - by }));
}

// The last body row whose bottom fits with the table's height beyond its rows; -1 for none.
function lastFittingRow(
  layouts: readonly ChildLayout[],
  headerCount: number,
  room: number,
): number {
  let last = -1;
  for (let index = headerCount; index < layouts.length; index += 1) {
    if ((layouts[index]?.bottom ?? Number.POSITIVE_INFINITY) > room) break;
    last = index;
  }
  return last;
}

/**
 * A table split after its last body row that fits, the second part repeating the header rows when
 * `repeatHeader` is set; null when no body row fits or the table has one body row.
 */
export function splitTableWith(repeatHeader: boolean) {
  return (block: LayoutBlock, fitting: number): SplitBlock | null => {
    const { node } = block;
    const rows = rowsOf(node);
    if (!isContainerMeasurement(block.measurement)) return null;
    const layouts = block.measurement.children;
    const headerCount = leadingHeaderRows(node);
    if (layouts.length !== rows.length || rows.length - headerCount <= 1) return null;
    const span = layouts.at(-1)?.bottom ?? 0;
    const overhead = Math.max(0, block.height - span);
    const last = lastFittingRow(layouts, headerCount, fitting - overhead);
    const next = layouts[last + 1];
    if (last < headerCount || !next) return null;
    const header = repeatHeader ? rows.slice(0, headerCount) : [];
    const headerLayouts = repeatHeader ? layouts.slice(0, headerCount) : [];
    const headerSpan = headerLayouts.at(-1)?.bottom ?? 0;
    const part = partIndex(node);
    const create = (index: number, content: ProseMirrorNode[]) =>
      node.type.create({ ...node.attrs, splitPartIndex: index }, content, node.marks);
    return {
      head: {
        ...block,
        node: create(part, rows.slice(0, last + 1)),
        height: overhead + (layouts[last]?.bottom ?? 0),
        measurement: { children: layouts.slice(0, last + 1) },
      },
      tail: [
        {
          ...block,
          node: create(part + 1, [...header, ...rows.slice(last + 1)]),
          height: overhead + headerSpan + span - next.top,
          leadLineHeight: null,
          breakBefore: true,
          measurement: {
            children: [...headerLayouts, ...shift(layouts.slice(last + 1), next.top - headerSpan)],
          },
        },
      ],
    };
  };
}
