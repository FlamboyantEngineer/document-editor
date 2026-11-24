// Markdown nested deeper than a document holds, flattened before it is read: a quote or list past
// the depth gives its blocks to the block it is in, and a format past it gives its text. The walk
// keeps its own stack, so no depth of nesting runs out of call stack.

import type { FootnoteDefinition, Parent, Root, RootContent } from 'mdast';
import type { MarkdownWarning } from './markdown-read.js';

/** The deepest nesting read as it is written. */
export const MAX_MARKDOWN_DEPTH = 32;

const FLATTENED = new Set(['blockquote', 'list', 'listItem']);
const FORMATS = new Set(['emphasis', 'strong', 'delete', 'link', 'linkReference']);

// A node's text, read without recursion.
function textOf(node: RootContent): string {
  let text = '';
  const stack: RootContent[] = [node];
  while (stack.length) {
    const next = stack.pop() as RootContent;
    if ('value' in next && typeof next.value === 'string') text += next.value;
    if ('children' in next)
      for (let at = next.children.length - 1; at >= 0; at -= 1)
        stack.push(next.children[at] as RootContent);
  }
  return text;
}

// The blocks a nested quote, list or item gives to the block it is in, without recursion.
function flatBlocks(node: RootContent): RootContent[] {
  const out: RootContent[] = [];
  const stack: RootContent[] = [node];
  while (stack.length) {
    const next = stack.pop() as RootContent;
    if (FLATTENED.has(next.type) && 'children' in next) {
      for (let at = next.children.length - 1; at >= 0; at -= 1)
        stack.push(next.children[at] as RootContent);
    } else out.push(next);
  }
  return out;
}

/** Flattens nesting past `MAX_MARKDOWN_DEPTH`, with a warning. Notes are handled when cited. */
export function flattenDeepNesting(tree: Root | FootnoteDefinition, warn: MarkdownWarning): void {
  const document = tree.type === 'root';
  const stack: { parent: Parent; depth: number }[] = [{ parent: tree, depth: document ? 0 : 1 }];
  while (stack.length) {
    const { parent, depth } = stack.pop() as { parent: Parent; depth: number };
    const deep = depth >= MAX_MARKDOWN_DEPTH;
    const children: RootContent[] = [];
    for (const child of parent.children as RootContent[]) {
      if (deep && FLATTENED.has(child.type)) {
        warn(child, 'nesting');
        children.push(...flatBlocks(child));
      } else if (deep && FORMATS.has(child.type)) {
        warn(child, 'nesting');
        children.push({ type: 'text', value: textOf(child) });
      } else children.push(child);
    }
    parent.children = children as Parent['children'];
    for (const child of children)
      if ('children' in child && (!document || child.type !== 'footnoteDefinition'))
        stack.push({ parent: child, depth: depth + 1 });
  }
}
