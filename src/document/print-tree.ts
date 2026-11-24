// A document as a tree of elements built from its schema's own rendering (`toDOM`), without a
// DOM, and that tree as HTML: what a static render of a stored document passes through.

import type { DOMOutputSpec, Mark, Node as ProseMirrorNode } from 'prosemirror-model';
import {
  escapeHtmlAttribute,
  escapeHtmlText,
  readOutputSpec,
  VOID_ELEMENTS,
} from './html-output.js';

/** An element of a rendered tree. */
export interface PrintElement {
  readonly tag: string;
  readonly attrs: Map<string, string>;
  children: PrintTree[];
}

/** A rendered tree: an element, text, or markup made by the library itself, written as it is. */
export type PrintTree = PrintElement | { readonly text: string } | { readonly markup: string };

/** Whether a tree is an element. */
export const isPrintElement = (tree: PrintTree): tree is PrintElement => 'tag' in tree;

/** A new element of a rendered tree. */
export function printElement(
  tag: string,
  attrs: Readonly<Record<string, string>> = {},
  children: PrintTree[] = [],
): PrintElement {
  return { tag, attrs: new Map(Object.entries(attrs)), children };
}

// A schema's rendering as a tree, its hole (`0`) filled with the content given.
function fromSpec(spec: DOMOutputSpec, content: readonly PrintTree[]): PrintTree[] {
  if (typeof spec === 'string') return [{ text: spec }];
  const { tag, attrs, children } = readOutputSpec(spec);
  const element: PrintElement = { tag, attrs: new Map(attrs), children: [] };
  for (const child of children) {
    if (child === 0) element.children.push(...content);
    else element.children.push(...fromSpec(child as DOMOutputSpec, content));
  }
  return [element];
}

/** Content with the marks it is wrapped in, outermost first. */
export interface MarkedTrees {
  readonly marks: readonly Mark[];
  readonly trees: readonly PrintTree[];
}

function markTree(mark: Mark, content: PrintTree[]): PrintTree[] {
  const toDOM = mark.type.spec.toDOM;
  return toDOM ? fromSpec(toDOM(mark, true), content) : content;
}

/**
 * Inline content in its marks, as a view draws it: neighbours that share a mark share its element,
 * so a mark breaks only where its run ends, however the content inside it is cut.
 */
export function markedContent(items: readonly MarkedTrees[], depth = 0): PrintTree[] {
  const out: PrintTree[] = [];
  let index = 0;
  while (index < items.length) {
    const item = items[index] as MarkedTrees;
    const mark = item.marks[depth];
    if (!mark) {
      out.push(...item.trees);
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < items.length && items[end]?.marks[depth]?.eq(mark)) end += 1;
    out.push(...markTree(mark, markedContent(items.slice(index, end), depth + 1)));
    index = end;
  }
  return out;
}

/** How a static render draws a node: its own drawing, such as a signature from its vector. */
export interface NodeDrawing {
  /** Takes a node's rendering and its position before it, and gives what is drawn. */
  readonly draw: (node: ProseMirrorNode, drawn: PrintTree[], pos: number) => PrintTree[];
  /** A node's content drawn otherwise, given its position before it; null to draw its children. */
  readonly content?: ((node: ProseMirrorNode, pos: number) => PrintTree[] | null) | undefined;
}

// A node's children, inline ones in their marks, given the node's position before it.
function childTrees(node: ProseMirrorNode, pos: number, drawing: NodeDrawing): PrintTree[] {
  const items: MarkedTrees[] = [];
  node.forEach((child, offset) => {
    const at = pos + 1 + offset;
    const trees = child.isText
      ? [{ text: child.text ?? '' }]
      : nodeTree(child, drawing, { at, unmarked: true });
    items.push({ marks: child.marks, trees });
  });
  return markedContent(items);
}

// The line break a view puts at the end of a text block that is empty or ends in no text, or in
// a line feed, so its last line takes its height as it does on the pages.
const TRAILING_BREAK = 'ProseMirror-trailingBreak';

function needsTrailingBreak(node: ProseMirrorNode): boolean {
  if (!node.isTextblock) return false;
  const last = node.lastChild;
  return !last || !last.isText || (last.text ?? '').endsWith('\n');
}

/**
 * A node as its schema renders it, with its content, each node passed to `drawing.draw` with its
 * position (`at`, before it); its marks drawn around it unless `unmarked`, as when its parent
 * draws them over its neighbours too.
 */
export function nodeTree(
  node: ProseMirrorNode,
  drawing: NodeDrawing,
  place: { readonly at?: number; readonly unmarked?: boolean } = {},
): PrintTree[] {
  const at = place.at ?? 0;
  if (node.isText) {
    const text = [{ text: node.text ?? '' }];
    return place.unmarked ? text : markedContent([{ marks: node.marks, trees: text }]);
  }
  const content = drawing.content?.(node, at) ?? childTrees(node, at, drawing);
  if (needsTrailingBreak(node)) content.push(printElement('br', { class: TRAILING_BREAK }));
  const toDOM = node.type.spec.toDOM;
  const drawn = drawing.draw(node, toDOM ? fromSpec(toDOM(node), content) : content, at);
  return place.unmarked ? drawn : markedContent([{ marks: node.marks, trees: drawn }]);
}

/** Each element of a tree, in document order. */
export function* printElements(trees: readonly PrintTree[]): Generator<PrintElement> {
  for (const tree of trees) {
    if (!isPrintElement(tree)) continue;
    yield tree;
    yield* printElements(tree.children);
  }
}

/** A tree as HTML. */
export function printHtml(trees: readonly PrintTree[]): string {
  return trees
    .map((tree) => {
      if ('text' in tree) return escapeHtmlText(tree.text);
      if ('markup' in tree) return tree.markup;
      const attrs = [...tree.attrs]
        .map(([name, value]) => ` ${name}="${escapeHtmlAttribute(value)}"`)
        .join('');
      if (VOID_ELEMENTS.has(tree.tag)) return `<${tree.tag}${attrs}>`;
      return `<${tree.tag}${attrs}>${printHtml(tree.children)}</${tree.tag}>`;
    })
    .join('');
}
