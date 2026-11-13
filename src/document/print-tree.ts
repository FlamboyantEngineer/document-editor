// A document as a tree of elements built from its schema's own rendering (`toDOM`), without a
// DOM, and that tree as HTML: what a static render of a stored document passes through.

import type { DOMOutputSpec, Mark, Node as ProseMirrorNode } from 'prosemirror-model';

/** An element of a rendered tree. */
export interface PrintElement {
  readonly tag: string;
  readonly attrs: Map<string, string>;
  children: PrintTree[];
}

/** A rendered tree: an element, text, or markup made by the library itself, written as it is. */
export type PrintTree = PrintElement | { readonly text: string } | { readonly markup: string };

const VOID = new Set(['br', 'col', 'hr', 'img', 'wbr']);

const escapeText = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const escapeAttribute = (value: string) => escapeText(value).replace(/"/g, '&quot;');

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
  if (!Array.isArray(spec)) throw new Error('A static render needs every rendering as data');
  const [rawTag, ...rest] = spec as readonly unknown[];
  // A namespaced tag, `ns tag`, is written by its name.
  const tag = String(rawTag).split(' ').pop() ?? '';
  const first = rest[0];
  const hasAttrs =
    first !== null && typeof first === 'object' && !Array.isArray(first) && first !== undefined;
  const attrs: Record<string, string> = {};
  if (hasAttrs) {
    for (const [name, value] of Object.entries(first as Record<string, unknown>)) {
      if (value !== null && value !== undefined) attrs[name] = String(value);
    }
  }
  const element = printElement(tag, attrs);
  for (const child of hasAttrs ? rest.slice(1) : rest) {
    if (child === 0) element.children.push(...content);
    else element.children.push(...fromSpec(child as DOMOutputSpec, content));
  }
  return [element];
}

// Text wrapped in its marks, outermost first.
function markedText(node: ProseMirrorNode): PrintTree[] {
  let trees: PrintTree[] = [{ text: node.text ?? '' }];
  for (const mark of [...node.marks].reverse()) trees = markTree(mark, trees);
  return trees;
}

function markTree(mark: Mark, content: PrintTree[]): PrintTree[] {
  const toDOM = mark.type.spec.toDOM;
  return toDOM ? fromSpec(toDOM(mark, true), content) : content;
}

/** How a static render draws a node of its own, such as a signature from its vector. */
export type DrawNode = (node: ProseMirrorNode, drawn: PrintTree[]) => PrintTree[];

/** A node as its schema renders it, with its content, each node first passed to `draw`. */
export function nodeTree(node: ProseMirrorNode, draw: DrawNode): PrintTree[] {
  if (node.isText) return markedText(node);
  const content: PrintTree[] = [];
  node.forEach((child) => content.push(...nodeTree(child, draw)));
  const toDOM = node.type.spec.toDOM;
  let drawn = draw(node, toDOM ? fromSpec(toDOM(node), content) : content);
  for (const mark of [...node.marks].reverse()) drawn = markTree(mark, drawn);
  return drawn;
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
      if ('text' in tree) return escapeText(tree.text);
      if ('markup' in tree) return tree.markup;
      const attrs = [...tree.attrs]
        .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
        .join('');
      if (VOID.has(tree.tag)) return `<${tree.tag}${attrs}>`;
      return `<${tree.tag}${attrs}>${printHtml(tree.children)}</${tree.tag}>`;
    })
    .join('');
}
