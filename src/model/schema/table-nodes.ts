// Tables: the table with its border, alignment and caption, its rows, and cells with their own
// alignment, height and colours, on top of the table nodes of `prosemirror-tables`.

import type { RichTextExtension } from '@flamboyantengineer/ui-components/rich-text-editor';
import type { Node as ProseMirrorNode, NodeSpec } from 'prosemirror-model';
import { tableNodes } from 'prosemirror-tables';
import { normalizeCaptionText } from './caption-text.js';
import {
  DATA_ID_ATTR,
  type DomAttributes,
  TABLE_BORDER_1PX_CLASS,
  TABLE_BORDER_CLASSES,
  TABLE_BORDER_NONE_CLASS,
  TABLE_CAPTION_TEXT_ATTR,
} from './dom-attributes.js';
import { DOCUMENT_NODE_ORDER } from './node-order.js';
import {
  firstRowColumnWidths,
  objectLayoutCss,
  parseObjectLayout,
  tableColumnTotalCss,
  tableObjectColumnWidths,
} from './object-layout.js';

type OutputSpec = ReturnType<NonNullable<NodeSpec['toDOM']>>;
type CellName = 'table_cell' | 'table_header';

// `(paragraph | block)+` admits exactly what `block+` does, but lists `paragraph` first, so a new
// row, column or split cell gets an empty paragraph rather than the first block type in order.
const baseNodes = tableNodes({
  tableGroup: 'block',
  cellContent: '(paragraph | block)+',
  cellAttributes: {},
});

/** A table's rows, header and footer rows included, as one body to parse. */
function tableContentElement(dom: HTMLElement): HTMLElement {
  if (dom.tagName.toLowerCase() !== 'table') return dom;
  const table = dom as HTMLTableElement;
  const body = dom.ownerDocument.createElement('tbody');
  const sections = [table.tHead, ...Array.from(table.tBodies), table.tFoot];
  for (const section of sections) {
    for (const row of Array.from(section?.rows ?? [])) body.appendChild(row.cloneNode(true));
  }
  if (!body.children.length) {
    for (const row of Array.from(table.querySelectorAll(':scope > tr'))) {
      body.appendChild(row.cloneNode(true));
    }
  }
  return body.children.length ? body : dom;
}

function directCaption(dom: HTMLElement): Element | null {
  if (dom.tagName.toLowerCase() === 'table' && (dom as HTMLTableElement).caption) {
    return (dom as HTMLTableElement).caption;
  }
  return dom.querySelector(':scope > caption');
}

function readBorderClass(dom: HTMLElement): string {
  if (dom.classList.contains(TABLE_BORDER_NONE_CLASS)) return TABLE_BORDER_NONE_CLASS;
  if (dom.classList.contains(TABLE_BORDER_1PX_CLASS)) return TABLE_BORDER_1PX_CLASS;
  return '';
}

function readTableAttrs(dom: HTMLElement) {
  const caption = directCaption(dom);
  return {
    tableBorderClass: readBorderClass(dom),
    objectLayout: parseObjectLayout(dom.getAttribute('data-object-layout')),
    captionEnabled: dom.getAttribute('data-caption-enabled') !== 'false',
    caption: normalizeCaptionText(
      dom.getAttribute(TABLE_CAPTION_TEXT_ATTR) || caption?.textContent || '',
    ),
    captionDataId: caption?.getAttribute(DATA_ID_ATTR) || null,
  };
}

/**
 * The column group that sizes a table's columns: an aligned table's columns always, an unaligned
 * table's columns that have a width. Every table has one, as column resizing expects.
 */
function columnGroup(widths: readonly number[], fitted: boolean) {
  const total = widths.reduce((sum, width) => sum + (width || 0), 0);
  const columns = widths.map((width) => {
    if (!width) return ['col'];
    return [
      'col',
      { style: `width:${fitted ? `${String((100 * width) / total)}%` : `${String(width)}px`}` },
    ];
  });
  return ['colgroup', ...columns];
}

function renderTable(node: ProseMirrorNode) {
  const attrs: DomAttributes = {};
  const layout = parseObjectLayout(node.attrs.objectLayout);
  const widths = layout ? tableObjectColumnWidths(node) : firstRowColumnWidths(node);
  if (layout) {
    const total = widths.reduce((sum, width) => sum + width, 0);
    attrs['data-object-layout'] = layout;
    const width = layout === 'fit-page-width' ? '100%' : `${String(total)}px`;
    attrs.style = `${objectLayoutCss(layout)};width:${width};max-width:100%`;
  } else if (widths.length && widths.every((width) => width > 0)) {
    // An unaligned table renders at its column total once every column has a width.
    attrs.style = `width:${tableColumnTotalCss(widths, node)};max-width:100%`;
  }
  if (node.attrs.captionEnabled === false) attrs['data-caption-enabled'] = 'false';
  attrs[TABLE_CAPTION_TEXT_ATTR] = normalizeCaptionText(node.attrs.caption || '');
  const borderClass = String(node.attrs.tableBorderClass || '');
  if (TABLE_BORDER_CLASSES.has(borderClass)) attrs.class = borderClass;
  const caption = node.attrs.captionEnabled === false ? [] : [captionLine(node.attrs.caption)];
  return [
    'table',
    attrs,
    ...caption,
    columnGroup(widths, layout === 'fit-page-width'),
    ['tbody', 0],
  ];
}

// The caption line: its label and number, which the stylesheet sets from the template, its text,
// and on a later part of a split table, the template's continued suffix.
function captionLine(caption: unknown) {
  return [
    'caption',
    {
      class: 'doc-caption-line doc-table-caption-line',
      'data-caption-kind': 'table',
      contenteditable: 'false',
    },
    [
      'span',
      { class: 'doc-caption-text', 'data-doc-caption-text': 'true' },
      normalizeCaptionText(caption || ''),
    ],
    ['span', { class: 'doc-caption-continued', 'data-doc-caption-continued': 'true' }, ''],
  ];
}

const table: NodeSpec = {
  ...baseNodes.table,
  attrs: {
    tableBorderClass: { default: '' },
    objectLayout: { default: null },
    caption: { default: '' },
    captionEnabled: { default: true },
    captionDataId: { default: null },
  },
  parseDOM: [{ tag: 'table', contentElement: tableContentElement, getAttrs: readTableAttrs }],
  toDOM: (node) => renderTable(node) as unknown as OutputSpec,
};

/** A colour from a stored attribute, without the characters that would end a style. */
function safeColor(value: unknown): string {
  return String(value).replace(/[;"<>]/g, '');
}

// The alignments a cell takes. A cell's alignment is written into its style, so any other text,
// which could carry declarations of its own, reads and writes as the default.
const TEXT_ALIGNMENTS = ['left', 'center', 'right', 'justify'];
const VERTICAL_ALIGNMENTS = ['top', 'middle', 'bottom'];

const textAlignOf = (value: unknown) => TEXT_ALIGNMENTS.find((each) => each === value) ?? 'left';
const verticalAlignOf = (value: unknown) =>
  VERTICAL_ALIGNMENTS.find((each) => each === value) ?? 'middle';

/** The most rows or columns a cell spans: the most columns HTML lets a cell span. */
const MAX_SPAN = 1000;

// A span from markup: a whole number within the limits, or 1 when it is not a number.
function readSpan(dom: HTMLElement, name: 'colspan' | 'rowspan'): number {
  const span = Math.trunc(Number(dom.getAttribute(name)));
  return Number.isFinite(span) ? Math.min(MAX_SPAN, Math.max(1, span)) : 1;
}

// Refuses a span a table cannot hold. A table's column group and its cell map take an entry for
// each row and column a cell spans, so a stored or synced span without a limit would hang the
// editor of everyone who opens the document.
function checkSpan(value: unknown): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_SPAN) {
    throw new RangeError(`a cell spans 1 to ${String(MAX_SPAN)} rows or columns`);
  }
}

function readColumnWidths(dom: HTMLElement): number[] | null {
  const value = dom.getAttribute('data-colwidth');
  if (!value) return null;
  const parsed = value.split(',').map((part) => Number.parseInt(part, 10));
  return parsed.some((width) => Number.isNaN(width)) ? null : parsed;
}

function readRowHeight(dom: HTMLElement): number | null {
  const value = dom.getAttribute('data-row-height') || dom.style.height;
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readCellAttrs(dom: HTMLElement) {
  return {
    colspan: readSpan(dom, 'colspan'),
    rowspan: readSpan(dom, 'rowspan'),
    colwidth: readColumnWidths(dom),
    textAlign: textAlignOf(dom.getAttribute('data-text-align') || dom.style.textAlign),
    verticalAlign: verticalAlignOf(
      dom.getAttribute('data-vertical-align') || dom.style.verticalAlign,
    ),
    rowHeight: readRowHeight(dom),
    textColor: dom.getAttribute('data-text-color') || dom.style.color || null,
    backgroundColor: dom.getAttribute('data-background-color') || dom.style.backgroundColor || null,
  };
}

function cellStyle(node: ProseMirrorNode, hasHeight: boolean): string {
  const { textAlign, verticalAlign, rowHeight, textColor, backgroundColor } = node.attrs;
  const parts = [
    `text-align: ${textAlignOf(textAlign)}`,
    `vertical-align: ${verticalAlignOf(verticalAlign)}`,
  ];
  if (hasHeight) parts.push(`height: ${String(rowHeight)}px`, `min-height: ${String(rowHeight)}px`);
  if (textColor) parts.push(`color: ${safeColor(textColor)}`);
  if (backgroundColor) parts.push(`background-color: ${safeColor(backgroundColor)}`);
  return parts.join('; ');
}

function renderCell(node: ProseMirrorNode, tag: 'td' | 'th') {
  const { colspan, rowspan, colwidth, rowHeight, textColor, backgroundColor } = node.attrs;
  const hasHeight = Number.isFinite(rowHeight) && Number(rowHeight) > 0;
  const attrs: Record<string, unknown> = {
    colspan,
    rowspan,
    'data-text-align': textAlignOf(node.attrs.textAlign),
    'data-vertical-align': verticalAlignOf(node.attrs.verticalAlign),
    style: cellStyle(node, hasHeight),
  };
  if (colwidth) attrs['data-colwidth'] = (colwidth as number[]).join(',');
  if (hasHeight) attrs['data-row-height'] = String(rowHeight);
  if (textColor) attrs['data-text-color'] = textColor;
  if (backgroundColor) attrs['data-background-color'] = backgroundColor;
  return [tag, attrs, 0];
}

function tableCell(name: CellName): NodeSpec {
  const tag = name === 'table_header' ? 'th' : 'td';
  return {
    ...baseNodes[name],
    attrs: {
      ...baseNodes[name].attrs,
      colspan: { default: 1, validate: checkSpan },
      rowspan: { default: 1, validate: checkSpan },
      textAlign: { default: 'left' },
      verticalAlign: { default: 'middle' },
      rowHeight: { default: null },
      textColor: { default: null },
      backgroundColor: { default: null },
    },
    parseDOM: [{ tag, getAttrs: readCellAttrs }],
    toDOM: (node) => renderCell(node, tag) as unknown as OutputSpec,
  };
}

/** Tables, their rows, cells and header cells. */
export const tableNodesExtension: RichTextExtension = {
  name: 'table-nodes',
  nodes: [
    { name: 'table', spec: table, order: DOCUMENT_NODE_ORDER.table },
    { name: 'table_row', spec: baseNodes.table_row, order: DOCUMENT_NODE_ORDER.table_row },
    { name: 'table_cell', spec: tableCell('table_cell'), order: DOCUMENT_NODE_ORDER.table_cell },
    {
      name: 'table_header',
      spec: tableCell('table_header'),
      order: DOCUMENT_NODE_ORDER.table_header,
    },
  ],
};
