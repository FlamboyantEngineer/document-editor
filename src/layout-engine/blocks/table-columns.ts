// A table's column widths and borders, decided here rather than by the browser's table layout:
// columns with a stored width keep it, the others share what is left equally, and a table too
// wide for its place is scaled to fit. The rendered table takes these widths as they are
// (DOCE-PAGINATION-10.5).

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { proportionColumns } from '../../model/layout/column-widths.js';
import {
  TABLE_BORDER_1PX_CLASS,
  TABLE_BORDER_HORIZONTAL_CLASS,
  TABLE_BORDER_NONE_CLASS,
} from '../../model/schema/dom-attributes.js';
import {
  ALIGNED_TABLE_COLUMN_WIDTH,
  firstRowColumnWidths,
  parseObjectLayout,
} from '../../model/schema/object-layout.js';

/** The width of a table's lines between columns and between rows. */
export interface TableBorders {
  readonly vertical: number;
  readonly horizontal: number;
}

/** A table's columns and its whole width, its outer border included. */
interface TableColumns {
  readonly widths: readonly number[];
  readonly width: number;
}

/** The lines a table draws: its class's, or the template's border on every side. */
export function tableBorders(table: ProseMirrorNode, templateBorder: number): TableBorders {
  switch (String(table.attrs.tableBorderClass || '')) {
    case TABLE_BORDER_NONE_CLASS:
      return { vertical: 0, horizontal: 0 };
    case TABLE_BORDER_HORIZONTAL_CLASS:
      return { vertical: 0, horizontal: templateBorder };
    case TABLE_BORDER_1PX_CLASS:
      return { vertical: 1, horizontal: 1 };
    default:
      return { vertical: templateBorder, horizontal: templateBorder };
  }
}

/**
 * A table's column widths in an available width. An aligned table's columns take their stored
 * width or a default, and one set to the page's width is scaled to it; an unaligned table spans
 * the width unless every column has a width, a column without one never taking less than an equal
 * share. Collapsed borders add one outer border to the sum.
 */
export function tableColumns(
  table: ProseMirrorNode,
  { available, borders, count }: { available: number; borders: TableBorders; count: number },
): TableColumns {
  const stored = firstRowColumnWidths(table);
  const own = Array.from({ length: count }, (_, index) => stored[index] ?? 0);
  const layout = parseObjectLayout(table.attrs.objectLayout);
  const room = Math.max(0, available - borders.vertical);
  if (layout) {
    const widths = own.map((width) => width || ALIGNED_TABLE_COLUMN_WIDTH);
    const total = widths.reduce((sum, width) => sum + width, 0);
    const fitted =
      layout === 'fit-page-width' || total > room ? proportionColumns(widths, room) : widths;
    return {
      widths: fitted,
      width: fitted.reduce((sum, width) => sum + width, 0) + borders.vertical,
    };
  }
  const set = own.reduce((sum, width) => sum + width, 0);
  const unset = own.filter((width) => !width).length;
  if (!unset) {
    const widths = set > room ? proportionColumns(own, room) : own;
    return { widths, width: widths.reduce((sum, width) => sum + width, 0) + borders.vertical };
  }
  // A column without a width takes what the others leave, but never less than an equal share of
  // the room; the stored columns are then scaled into the rest.
  const least = room / count;
  const share = Math.max(0, room - set) / unset;
  if (share >= least) return { widths: own.map((width) => width || share), width: available };
  const rest = proportionColumns(own, Math.max(0, room - least * unset));
  const widths = own.map((width, index) => (width ? (rest[index] ?? 0) : least));
  return { widths, width: available };
}
