import type { Node } from 'prosemirror-model';
import type { LineTable } from '../../../../src/layout-engine/line-table.js';
import type { MetricsContext } from '../../../../src/layout-engine/metrics.js';
import { createTextLayout } from '../../../../src/layout-engine/text-layout.js';
import {
  type LayoutBlock,
  layoutPages,
  type LayoutRules,
} from '../../../../src/model/pagination/page-layout.js';
import { contentBlocks, requireValue } from './fixtures.js';
import { labLanguage, labMeasurer } from './fonts.js';
import {
  cellBorder,
  cellPadding,
  contentHeight,
  displayMath,
  fontStacks,
  inlineMath,
  listAfter,
  listBefore,
  listIndent,
  pageHeight,
  pageWidth,
  paragraph,
  template,
} from './settings.js';

export interface Line {
  readonly from: number;
  readonly width: number;
}
export interface Block {
  readonly node: Node;
  readonly path: string;
  readonly width: number;
  readonly height: number;
  readonly before: number;
  readonly after: number;
  readonly lines?: readonly Line[];
  /** A text block's line table from the library's text layout engine. */
  readonly table?: LineTable;
  /** The line height of a block measured in the HTML, whose lines are all as tall. */
  readonly leading?: number;
  readonly children?: readonly Block[];
}
export interface Fragment {
  readonly block: Block;
  /** Offsets into the original block's ProseMirror content, including atoms. */
  readonly from: number;
  readonly to: number;
  readonly top: number;
  readonly height: number;
}
export interface PageIndex {
  readonly width: number;
  readonly contentWidth: number;
  readonly contentHeight: number;
  readonly height: number;
  readonly pages: readonly (readonly Fragment[])[];
}

/** The library's text layout engine, keeping prepared text between layouts. */
export type PreparationCache = ReturnType<typeof createPreparationCache>;

// Inline math is a fixed box that sits 3px below the baseline, inside the paragraph's strut, as
// the lab's stylesheet draws it.
const mathBaseline = inlineMath.height - 3;

export function createPreparationCache({
  scale = 1,
  measureContext,
}: { scale?: number | undefined; measureContext?: MetricsContext | undefined } = {}) {
  return createTextLayout({
    template,
    fontStacks,
    language: labLanguage,
    scale,
    measureContext,
    // The page draws its text unhinted only with font-file widths (settings.ts).
    hinted: labMeasurer !== 'font-files',
    // Every inline atom is a box here; the spike sizes only inline math.
    textAtoms: { types: new Set() },
    measureAtom: (node) =>
      node.type.name === 'math_inline' && !node.marks.length
        ? { ...inlineMath, baseline: mathBaseline }
        : null,
  });
}

/** Whether code, or a code figure's code, ends in a line break, which shows as an empty line. */
export function endsInLineBreak(node: Node): boolean {
  const code = node.type.name === 'code_figure' ? node.lastChild : node;
  return code?.type.name === 'code_block' && code.textContent.endsWith('\n');
}

export function blockId(node: Node): string | null {
  const id: unknown = node.attrs.dataId;
  return typeof id === 'string' ? id : null;
}

function dimensions(node: Node) {
  const width: unknown = node.attrs.width;
  const height: unknown = node.attrs.height;
  return typeof width === 'number' && width > 0 && typeof height === 'number' && height > 0
    ? { width, height }
    : null;
}

function columnWidth(node: Node): number | undefined {
  const widths: unknown = node.attrs.colwidth;
  const width: unknown = Array.isArray(widths) ? widths[0] : null;
  return typeof width === 'number' && width > 0 ? width : undefined;
}

class Predictor {
  readonly issues: string[] = [];
  constructor(private readonly cache: PreparationCache) {}

  issue(node: Node, path: string, reason: string) {
    this.issues.push(`${path} (${blockId(node) ?? node.type.name}): ${reason}`);
  }

  text(node: Node, path: string, width: number, nested: boolean): Block {
    const laid = this.cache.layoutText(node, { width });
    if (!laid.ok) this.issue(node, path, laid.reason);
    const table = laid.ok ? laid.table : undefined;
    const style = this.cache.typography(node);
    const lines = table?.lines.map((line) => ({ from: line.from, width: line.width })) ?? [];
    // Code ending in a line break shows the empty line after it, as the editor draws it (html.ts).
    const last = table?.lines.at(-1);
    const trailing = last && endsInLineBreak(node) ? last.height : 0;
    if (trailing) lines.push({ from: node.content.size, width: 0 });
    return {
      node,
      path,
      width,
      lines,
      ...(table ? { table } : {}),
      height: table ? table.height + table.overhead + trailing : 0,
      before: nested ? 0 : style.marginTop,
      after: nested ? 0 : style.marginBottom,
    };
  }

  children(node: Node, path: string, width: number, nested = true) {
    const children: Block[] = [];
    node.forEach((child, _offset, index) =>
      children.push(this.block(child, `${path}.${String(index)}`, width, nested)),
    );
    return children;
  }

  table(node: Node, path: string, width: number): Block {
    const table = node.lastChild;
    const widths: number[] = [];
    table?.firstChild?.forEach((cell) => widths.push(columnWidth(cell) ?? 0));
    const tableWidth = widths.reduce((sum, value) => sum + value, 0);
    if (
      node.firstChild?.content.size ||
      table?.attrs.captionEnabled !== false ||
      table?.attrs.objectLayout ||
      table?.attrs.tableBorderClass ||
      !widths.length ||
      widths.some((value) => value <= 2 * (cellPadding + cellBorder)) ||
      tableWidth > width
    ) {
      this.issue(
        node,
        path,
        'table requires a hidden empty caption and explicit fitting column widths',
      );
    }
    const children: Block[] = [];
    table?.forEach((row, _offset, rowIndex) => {
      const rowPath = `${path}.1.${String(rowIndex)}`;
      const cells: Block[] = [];
      row.forEach((cell, _cellOffset, index) => {
        const cellPath = `${rowPath}.${String(index)}`;
        const column = widths[index] ?? 0;
        if (
          cell.attrs.colspan !== 1 ||
          cell.attrs.rowspan !== 1 ||
          (columnWidth(cell) ?? column) !== column ||
          cell.attrs.rowHeight ||
          cell.childCount !== 1 ||
          cell.firstChild?.type.name !== 'paragraph'
        ) {
          this.issue(
            cell,
            cellPath,
            'only unmerged cells with one paragraph and no row-height override are supported',
          );
        }
        const paragraphs = this.children(cell, cellPath, column - 2 * (cellPadding + cellBorder));
        cells.push({
          node: cell,
          path: cellPath,
          width: column,
          children: paragraphs,
          before: 0,
          after: 0,
          height: stack(paragraphs) + 2 * (cellPadding + cellBorder),
        });
      });
      if (cells.length !== widths.length) this.issue(row, rowPath, 'column count varies by row');
      const height = Math.max(0, ...cells.map((cell) => cell.height));
      children.push({
        node: row,
        path: rowPath,
        width: tableWidth,
        children: cells.map((cell) => ({ ...cell, height })),
        height,
        before: 0,
        after: 0,
      });
    });
    return {
      node,
      path,
      width: tableWidth,
      children,
      height: stack(children),
      before: 0,
      after: paragraph.after,
    };
  }

  block(node: Node, path: string, width: number, nested = false): Block {
    const plain = { node, path, width, height: 0, before: 0, after: nested ? 0 : paragraph.after };
    if (width <= 0) this.issue(node, path, 'no space remains after nesting or cell padding');
    if (node.attrs.suggestionFormat || node.attrs.suggestionSplitKind)
      this.issue(node, path, 'suggestion projections are unsupported');
    switch (node.type.name) {
      case 'paragraph':
      case 'heading': {
        if (
          node.attrs.customStyle ||
          node.attrs.styleId ||
          (node.attrs.paragraphLevel && node.attrs.paragraphLevel !== 1) ||
          node.attrs.docTitle ||
          node.attrs.className ||
          node.attrs.textAlign ||
          node.attrs.indent
        )
          this.issue(node, path, 'per-block typography overrides are unsupported');
        return this.text(node, path, width, nested);
      }
      case 'bullet_list':
      case 'ordered_list': {
        const children = this.children(node, path, width - listIndent);
        return {
          ...plain,
          children,
          height: stack(children),
          before: nested ? 0 : listBefore,
          after: nested ? 0 : listAfter,
        };
      }
      case 'list_item': {
        if (node.attrs.checked !== null) this.issue(node, path, 'task list items are unsupported');
        const children = this.children(node, path, width);
        return { ...plain, children, height: stack(children) };
      }
      case 'code_figure': {
        if (node.firstChild?.content.size || node.lastChild?.attrs.captionEnabled !== false)
          this.issue(node, path, 'code captions are unsupported');
        const child = requireValue(node.lastChild, 'code block body');
        const body = this.text(child, `${path}.1`, width, true);
        const style = this.cache.typography(child);
        return {
          ...plain,
          height: body.height,
          before: style.marginTop,
          after: style.marginBottom,
          children: [body],
        };
      }
      case 'table_figure':
        return this.table(node, path, width);
      case 'figure': {
        const size = dimensions(node);
        if (
          !size ||
          size.width > width ||
          node.attrs.captionEnabled !== false ||
          node.firstChild?.content.size ||
          node.attrs.objectLayout ||
          !node.attrs.src ||
          node.attrs.fileAssetId
        )
          this.issue(
            node,
            path,
            'image requires explicit fitting dimensions, a source URL and no caption or float',
          );
        return { ...plain, height: size?.height ?? 0 };
      }
      case 'math_display':
        if (displayMath.width > width)
          this.issue(node, path, 'display math box is wider than the content area');
        return { ...plain, width: displayMath.width, height: displayMath.height };
      default:
        this.issue(node, path, `unsupported block ${node.type.name}`);
        return plain;
    }
  }
}

function stack(blocks: readonly Block[]) {
  return blocks.reduce(
    (height, block, index) =>
      height + block.height + (index ? Math.max(block.before, blocks[index - 1]?.after ?? 0) : 0),
    0,
  );
}

export function measureDocument(doc: Node, width: number, cache: PreparationCache) {
  const predictor = new Predictor(cache);
  if (doc.childCount !== 1)
    predictor.issues.push('Only one section using the base template scope is supported');
  doc.descendants((node) => {
    if (node.type.name === 'page_section' && (node.attrs.pageHeader || node.attrs.pageFooter)) {
      predictor.issues.push('Custom headers and footers are unsupported');
    }
    return node.type.name !== 'page_content';
  });
  const blocks = contentBlocks(doc).map((node, index) =>
    predictor.block(node, String(index), width),
  );
  for (const block of blocks) {
    if (block.node.type.name !== 'paragraph' && block.height > contentHeight) {
      predictor.issue(
        block.node,
        block.path,
        'an indivisible block exceeds the page content height',
      );
    }
  }
  return { blocks, issues: predictor.issues };
}

type MeasuredFragment = LayoutBlock & {
  readonly measurement: Omit<Fragment, 'top' | 'height'> & {
    readonly firstLine: number;
    readonly lastLine: number;
  };
};

// The height of a block's lines from `first` up to `end`: from its line table, or at its leading.
function linesHeight(block: Block, first: number, end: number): number {
  const lines = block.table?.lines;
  if (!lines) return (end - first) * (block.leading ?? 0);
  const top = lines[first];
  const bottom = lines[end - 1];
  return top && bottom ? bottom.top + bottom.height - top.top : 0;
}

function piece(
  block: Block,
  from: number,
  to: number,
  firstLine: number,
  lastLine: number,
): MeasuredFragment {
  const whole = from === 0 && to === block.node.content.size;
  return {
    node: block.node,
    height: whole ? block.height : linesHeight(block, firstLine, lastLine),
    marginTop: from === 0 ? block.before : 0,
    marginBottom: to === block.node.content.size ? block.after : 0,
    measurement: { block, from, to, firstLine, lastLine },
  };
}

const rules: LayoutRules = {
  heading: { keepsWithHeading: true },
  paragraph: {
    keepsWithHeading: true,
    split(item, available) {
      const { block, from, to, firstLine, lastLine } = (item as MeasuredFragment).measurement;
      if (!block.lines) return null;
      let count = 0;
      while (
        count < lastLine - firstLine - 2 &&
        linesHeight(block, firstLine, firstLine + count + 1) <= available
      )
        count += 1;
      const splitLine = firstLine + count;
      const split = block.lines[splitLine]?.from ?? 0;
      if (count < 2 || split <= from || split >= to) return null;
      return {
        head: piece(block, from, split, firstLine, splitLine),
        tail: [{ ...piece(block, split, to, splitLine, lastLine), breakBefore: true }],
      };
    },
  },
  bullet_list: { keepsWithHeading: true },
  ordered_list: { keepsWithHeading: true },
  code_figure: { keepsWithHeading: true },
  table_figure: { keepsWithHeading: true },
  figure: { keepsWithHeading: true },
  math_display: { keepsWithHeading: true },
};

/**
 * The pages the blocks fill. `room` is the height each page's content is packed into: the page's
 * content height, or a share of it in the oracle's negative control (DOCE-LABS-5.2).
 */
export function indexPages(
  blocks: readonly Block[],
  width: number,
  room = contentHeight,
): PageIndex {
  const items = blocks.map((block) =>
    piece(block, 0, block.node.content.size, 0, block.lines?.length ?? 0),
  );
  const pages = layoutPages(items, { pageHeight: room, rules });
  return {
    width: pageWidth(width),
    contentWidth: width,
    contentHeight,
    height: pageHeight,
    pages: pages.map((page) => {
      let bottom = 0;
      let previous: LayoutBlock | undefined;
      return page.map((layout) => {
        const item = layout as MeasuredFragment;
        const top = previous ? bottom + Math.max(previous.marginBottom, item.marginTop, 0) : 0;
        previous = item;
        bottom = top + item.height;
        const { block, from, to } = item.measurement;
        return { block, from, to, top, height: item.height };
      });
    }),
  };
}
