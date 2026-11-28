// Splits a table between its body rows. The editor measures where each row sits; the second part
// repeats the leading header rows when the template asks for it. A table with its caption splits
// with it: each part holds the caption, which a later part repeats as its text alone.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { firstRowColumnWidths } from '../schema/object-layout.js';
import {
  type ChildLayout,
  type ContainerMeasurement,
  isContainerMeasurement,
} from './container-split.js';
import { continuedCaptionOf, splitHeldWith } from './held-split.js';
import type { LayoutBlock, SplitBlock, SplitContext } from './page-layout.js';
import { splitPartOf } from './split-part.js';
import { leadingHeaderRows, projectedHeaderRows } from './table-headers.js';

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

// For each row, whether no cell spans past it: a table splits only after such a row.
function closedRows(rows: readonly ProseMirrorNode[]): boolean[] {
  let open = -1;
  return rows.map((row, index) => {
    row.forEach((cell) => {
      const span = cell.attrs.rowspan as unknown;
      const rowspan = typeof span === 'number' && span > 1 ? span : 1;
      open = Math.max(open, index + rowspan - 1);
    });
    return open <= index;
  });
}

// The last body row that fits and no cell spans past; -1 for none. On a page with nothing else on
// it, where no body row fits, the first that no cell spans past: the rows to it are taller than a
// page, so they overflow it alone and the rest go on to the next.
function lastSplitRow(closed: readonly boolean[], layouts: readonly ChildLayout[], fit: Fit) {
  let last = lastFittingRow(layouts, fit.headerCount, fit.room);
  while (last >= fit.headerCount && !closed[last]) last -= 1;
  if (last >= fit.headerCount || !fit.emptyPage) return last;
  const first = closed.findIndex((ends, index) => index >= fit.headerCount && ends);
  return first < 0 ? -1 : first;
}

// Whether a split is asked on a page that holds nothing yet.
const onEmptyPage = (context: SplitContext | undefined) =>
  context !== undefined && context.remainingHeight >= context.pageHeight;

function nextBodyRow(layouts: readonly ChildLayout[], last: number, headerCount: number) {
  return last < headerCount ? undefined : layouts[last + 1];
}

interface Fit {
  readonly headerCount: number;
  readonly room: number;
  readonly emptyPage: boolean;
}

const measuredHeaders = (table: ProseMirrorNode, measurement: ContainerMeasurement) =>
  measurement.tableHeaderRows ?? leadingHeaderRows(table);

/**
 * A table split after its last body row that fits and no cell spans past, the second part
 * repeating the header rows when `repeatHeader` is set; on an empty page where none fits, after the
 * first such row, which overflows it; null when no such body row fits on a page holding other
 * blocks, or the table has one body row.
 */
export function splitTableWith(repeatHeader: boolean) {
  return (block: LayoutBlock, fitting: number, context?: SplitContext): SplitBlock | null => {
    const { node } = block;
    const rows = node.children;
    if (!isContainerMeasurement(block.measurement)) return null;
    const layouts = block.measurement.children;
    const projected = projectedHeaderRows(node);
    const headerCount = projected ?? measuredHeaders(node, block.measurement);
    if (layouts.length !== rows.length || rows.length - headerCount <= 1) return null;
    const span = layouts.at(-1)?.bottom ?? 0;
    const overhead = Math.max(0, block.height - span);
    const closed = closedRows(rows);
    const last = lastSplitRow(closed, layouts, {
      headerCount,
      room: fitting - overhead,
      emptyPage: onEmptyPage(context),
    });
    const next = nextBodyRow(layouts, last, headerCount);
    if (!next) return null;
    // The repeat must be a complete grid of its own. A header cell continuing into the body
    // would occupy a column in the continuation's first body row that another cell already uses.
    const repeatedHeaderCount = repeatHeader && closed[headerCount - 1] ? headerCount : 0;
    const header = rows.slice(0, repeatedHeaderCount);
    const headerLayouts = layouts.slice(0, repeatedHeaderCount);
    const headerSpan = headerLayouts.at(-1)?.bottom ?? 0;
    const part = splitPartOf(node) ?? 0;
    const widths = firstRowColumnWidths(node).map((width) => width || 0);
    const create = (index: number, count: number | null, content: ProseMirrorNode[]) =>
      node.type.create(
        {
          ...node.attrs,
          splitPartIndex: index,
          projectedColumnWidths: index > 0 ? widths : null,
          projectedHeaderRows: count,
        },
        content,
        node.marks,
      );
    return {
      head: {
        ...block,
        node: create(part, projected, rows.slice(0, last + 1)),
        height: overhead + (layouts[last]?.bottom ?? 0),
        measurement: { ...block.measurement, children: layouts.slice(0, last + 1) },
      },
      tail: [
        {
          ...block,
          node: create(part + 1, repeatedHeaderCount, [...header, ...rows.slice(last + 1)]),
          height: overhead + headerSpan + span - next.top,
          breakBefore: true,
          measurement: {
            children: [...headerLayouts, ...shift(layouts.slice(last + 1), next.top - headerSpan)],
            tableHeaderRows: repeatedHeaderCount,
          },
        },
      ],
    };
  };
}

function hideUnrepeatedCaption(part: LayoutBlock, height: number): LayoutBlock {
  const { node, measurement } = part;
  if (!isContainerMeasurement(measurement) || measurement.tableHeaderRows !== 0) return part;
  const caption = node.firstChild;
  const table = node.lastChild;
  if (!caption || !table) return part;
  const hidden = caption.type.create({ ...caption.attrs, continuedText: null });
  return {
    ...part,
    node: node.type.create(node.attrs, [hidden, table], node.marks),
    height: Math.max(0, part.height - height),
  };
}

/**
 * A table with its caption split as its table splits (`splitTableWith`), the node holding them
 * measured by its table's rows (`splitHeldWith`); a later part without repeated headers has no
 * continued caption or caption height.
 */
export const splitTableFigureWith = (repeatHeader: boolean) => {
  const split = splitHeldWith(splitTableWith(repeatHeader));
  return (block: LayoutBlock, fitting: number, context?: SplitContext): SplitBlock | null => {
    const result = split(block, fitting, context);
    if (!result) return null;
    const measured = block.measurement;
    // The caption a later part shows, with the continued suffix.
    const caption = isContainerMeasurement(measured)
      ? Math.max(0, (measured.caption ?? 0) + continuedCaptionOf(measured))
      : 0;
    return { ...result, tail: result.tail.map((part) => hideUnrepeatedCaption(part, caption)) };
  };
};
