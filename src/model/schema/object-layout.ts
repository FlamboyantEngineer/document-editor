// How a figure or table sits across the content width: left, centered, right or fitted to the
// page width, and the column widths an aligned table renders at.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { TABLE_BORDER_1PX_CLASS, TABLE_BORDER_NONE_CLASS } from './dom-attributes.js';

export type ObjectLayout = 'left' | 'center' | 'right' | 'fit-page-width';
export const OBJECT_LAYOUT_OPTIONS: readonly { value: ObjectLayout; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
  { value: 'fit-page-width', label: 'Fit to page width' },
];

export function parseObjectLayout(value: unknown): ObjectLayout | null {
  return OBJECT_LAYOUT_OPTIONS.find((option) => option.value === value)?.value ?? null;
}

export function objectLayoutStyle(value: unknown): { marginLeft?: string; marginRight?: string } {
  const layout = parseObjectLayout(value);
  if (!layout) return {};
  return {
    marginLeft: layout === 'center' || layout === 'right' ? 'auto' : '0',
    marginRight: layout === 'center' || layout === 'left' ? 'auto' : '0',
  };
}

export function objectLayoutCss(value: unknown): string {
  const style = objectLayoutStyle(value);
  return style.marginLeft == null
    ? ''
    : `margin-left:${style.marginLeft};margin-right:${style.marginRight}`;
}

// Per-column widths of the first row as stored (NaN or 0 when a column has none).
function firstRowColumnWidths(node: ProseMirrorNode): number[] {
  const widths: number[] = [];
  node.firstChild?.forEach((cell) => {
    for (let index = 0; index < (Number(cell.attrs.colspan) || 1); index += 1) {
      widths.push(Number(cell.attrs.colwidth?.[index]));
    }
  });
  return widths;
}

export function tableObjectColumnWidths(node: ProseMirrorNode): number[] {
  return firstRowColumnWidths(node).map((width) => width || 100);
}

// Collapsed borders add one outer border to the sum of fixed column widths.
function tableColumnTotalCss(widths: number[], node: ProseMirrorNode): string {
  const border =
    node.attrs.tableBorderClass === TABLE_BORDER_NONE_CLASS
      ? '0px'
      : node.attrs.tableBorderClass === TABLE_BORDER_1PX_CLASS
        ? '1px'
        : 'var(--doc-table-border-width, 1px)';
  return `calc(${widths.reduce((sum, width) => sum + width, 0)}px + ${border})`;
}

export function tableObjectLayoutStyle(node: ProseMirrorNode): {
  width?: string;
  marginLeft?: string;
  marginRight?: string;
} {
  if (!parseObjectLayout(node.attrs.objectLayout)) return {};
  // The aligned wrapper includes the outer border so the page's content clip retains it.
  return {
    ...objectLayoutStyle(node.attrs.objectLayout),
    width:
      node.attrs.objectLayout === 'fit-page-width'
        ? '100%'
        : tableColumnTotalCss(tableObjectColumnWidths(node), node),
  };
}

/**
 * The caption line spans exactly its table, so the template's caption alignment is relative to
 * the table. An unaligned table renders at its column total once every column
 * has a width (prosemirror-tables), and at the content width otherwise.
 */
export function tableCaptionLineStyle(node: ProseMirrorNode): {
  width?: string;
  marginLeft?: string;
  marginRight?: string;
} {
  if (parseObjectLayout(node.attrs.objectLayout)) return tableObjectLayoutStyle(node);
  const widths = firstRowColumnWidths(node);
  return widths.length && widths.every((width) => width > 0)
    ? { width: tableColumnTotalCss(widths, node) }
    : {};
}
