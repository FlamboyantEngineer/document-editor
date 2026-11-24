// Markdown's blocks, as mdast gives them, read into stored blocks: headings, paragraphs, quotes,
// lists with their start number and checked items, fenced and indented code with its language, `$$`
// display math, rules and GitHub tables with their alignment. HTML blocks are left out with a
// warning; figures and captions are taken in afterwards, as the library's writer places them.

import type { BlockContent, DefinitionContent, List, RootContent, Table } from 'mdast';
import type { Math as MathNode } from 'mdast-util-math';
import { joinText } from '../../import/stored-inline.js';
import type { StoredNode } from './document-format.js';
import { withObjects } from './markdown-read-captions.js';
import { type InlineContext, readInline } from './markdown-read-inline.js';

/** What block reading needs: the inline context and the Markdown read, for `$$` in a paragraph. */
export interface BlockContext extends InlineContext {
  readonly source: string;
}

const withContent = (type: string, content: StoredNode[], attrs?: Record<string, unknown>) => ({
  type,
  ...(attrs ? { attrs } : {}),
  ...(content.length ? { content } : {}),
});

function list(node: List, context: BlockContext): StoredNode {
  const start = node.ordered && node.start !== null && node.start !== undefined && node.start !== 1;
  return {
    type: node.ordered ? 'orderedList' : 'bulletList',
    ...(start ? { attrs: { start: node.start } } : {}),
    content: node.children.map((item) => {
      const checked = typeof item.checked === 'boolean' ? item.checked : null;
      const content = readBlocks(item.children, context);
      // A checklist is a bulleted list: a numbered item keeps its box as text.
      if (node.ordered && checked !== null) return withContent('listItem', boxed(content, checked));
      return withContent('listItem', content, checked === null ? undefined : { checked });
    }),
  };
}

// Content whose first paragraph starts with a task list box again, as text.
function boxed(content: StoredNode[], checked: boolean): StoredNode[] {
  const [first, ...rest] = content;
  const box: StoredNode = { type: 'text', text: checked ? '[x] ' : '[ ] ' };
  if (first?.type !== 'paragraph') return [{ type: 'paragraph', content: [box] }, ...content];
  return [{ ...first, content: joinText([box, ...(first.content ?? [])]) }, ...rest];
}

function table(node: Table, context: BlockContext): StoredNode {
  const width = node.children[0]?.children.length ?? 0;
  const rows = node.children.map((row, index) => ({
    type: 'tableRow',
    content: row.children.slice(0, width).map((cell, column) => {
      const align = node.align?.[column];
      const content = readInline(cell.children, context);
      return {
        type: index === 0 ? 'tableHeader' : 'tableCell',
        ...(align === 'center' || align === 'right' ? { attrs: { align } } : {}),
        content: [withContent('paragraph', content)],
      };
    }),
  }));
  return { type: 'table', content: [{ type: 'caption' }, ...rows] };
}

// A paragraph holding only `$$` math, which is display math written on one line.
function displayMath(node: RootContent, source: string): StoredNode | null {
  const [only] = node.type === 'paragraph' && node.children.length === 1 ? node.children : [];
  if (only?.type !== 'inlineMath') return null;
  if (!source.startsWith('$$', only.position?.start.offset ?? -1)) return null;
  return withContent('mathBlock', [], only.value ? { source: only.value } : undefined);
}

// Fenced `$$` math; text after the opening signs is the block's label, which an equation does not
// hold.
function mathBlock(node: MathNode, context: BlockContext): StoredNode {
  if (node.meta) context.warnings.add('content-left-out', 'math label');
  return withContent('mathBlock', [], node.value ? { source: node.value } : undefined);
}

function readBlock(
  node: RootContent | BlockContent | DefinitionContent,
  context: BlockContext,
): StoredNode[] {
  switch (node.type) {
    case 'heading':
      return [
        withContent(
          'heading',
          readInline(node.children, context),
          node.depth > 1 ? { level: node.depth } : undefined,
        ),
      ];
    case 'paragraph':
      return [
        displayMath(node, context.source) ??
          withContent('paragraph', readInline(node.children, context)),
      ];
    case 'blockquote':
      return [withContent('blockquote', readBlocks(node.children, context))];
    case 'list':
      return [list(node, context)];
    case 'code':
      return [
        withContent(
          'codeBlock',
          node.value ? [{ type: 'text', text: node.value }] : [],
          node.lang ? { language: node.lang } : undefined,
        ),
      ];
    case 'math':
      return [mathBlock(node, context)];
    case 'thematicBreak':
      return [{ type: 'rule' }];
    case 'table':
      return [table(node, context)];
    case 'html':
      context.warnings.add('content-left-out', 'HTML block');
      return [];
    default:
      return [];
  }
}

/** mdast blocks as stored blocks, with figures and captions as the writer places them. */
export function readBlocks(
  nodes: readonly (RootContent | BlockContent | DefinitionContent)[],
  context: BlockContext,
): StoredNode[] {
  return withObjects(nodes.flatMap((node) => readBlock(node, context)));
}
