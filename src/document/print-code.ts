// Code in a drawing of a layout (DOCE-PAGINATION-13.3): a code block and linked code drawn as the
// pages' views draw them (`code-drawing.ts`), their text as its highlighted tokens on the lines the
// engine laid the code out on, with the gutter of line numbers beside it where the pages drew one,
// broken where those lines wrap the code.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import {
  type CodeTree,
  codeTrees,
  continuesCodeLine,
  firstCodeLine,
  gutterDigits,
  gutterRows,
  gutterText,
  gutterTree,
  wrapsOfMarks,
} from '../engine/code-drawing.js';
import type { PagesLayoutBlock } from './pages-layout.js';
import { isPrintElement, type PrintElement, printElement, type PrintTree } from './print-tree.js';

const CODE_TYPES = new Set(['code_block', 'linked_code_block']);

/** Whether a node is code its drawing draws as the pages' views do. */
export const isCode = (node: ProseMirrorNode): boolean => CODE_TYPES.has(node.type.name);

const linked = (node: ProseMirrorNode) => node.type.name === 'linked_code_block';

// The code a node shows: linked code's from its attributes.
const codeOf = (node: ProseMirrorNode) =>
  linked(node) ? String(node.attrs.code ?? '') : node.textContent;

const printTrees = (trees: readonly CodeTree[]): PrintTree[] =>
  trees.map((tree) =>
    typeof tree === 'string'
      ? { text: tree }
      : printElement(tree.tag, tree.attrs, printTrees(tree.children)),
  );

/** A code block's or linked code's text as its tokens, inside the marks of its lines. */
export const codeContent = (node: ProseMirrorNode, block: PagesLayoutBlock): PrintTree[] =>
  printTrees(codeTrees(codeOf(node), node.attrs.language, block.marks));

const childElement = (element: PrintElement, tag: string) =>
  element.children.find(
    (child): child is PrintElement => isPrintElement(child) && child.tag === tag,
  );

/**
 * Draws code's own parts in the element its markup drew: linked code's text, and, where the pages
 * drew one, the gutter before the code, sized by the digits of its highest number.
 */
export function drawCodeParts(
  root: PrintElement,
  node: ProseMirrorNode,
  block: PagesLayoutBlock,
): void {
  const pre = root.tag === 'pre' ? root : childElement(root, 'pre');
  const code = pre && childElement(pre, 'code');
  if (!pre || !code) return;
  if (linked(node)) code.children = codeContent(node, block);
  if (!block.gutter) return;
  const text = gutterText(node);
  const first = firstCodeLine(node);
  const wraps = wrapsOfMarks(block.marks);
  const continued = continuesCodeLine(node);
  const [gutter] = printTrees([gutterTree(text, { first, wraps, continued })]);
  if (gutter) pre.children.splice(pre.children.indexOf(code), 0, gutter);
  const digits = gutterDigits(first, gutterRows(text, null).length);
  const style = pre.attrs.get('style');
  const declaration = `--de-code-gutter-digits: ${String(digits)}`;
  pre.attrs.set('style', style ? `${style}; ${declaration}` : declaration);
}
