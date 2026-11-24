// Markdown nested deeper than a document holds, flattened before it is read: a quote or list past
// the depth gives its blocks to the block it is in, and a format past it gives its text. The walk
// keeps its own stack, so no depth of nesting runs out of call stack.

import type { Parent, Root, RootContent } from 'mdast';
import type { ImportWarnings } from '../../import/import-warnings.js';

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

/** The tree with nesting past `MAX_MARKDOWN_DEPTH` flattened, each with a warning. */
export function flattenDeepNesting(tree: Root, warnings: ImportWarnings): Root {
  const stack: { parent: Parent; depth: number }[] = [{ parent: tree, depth: 0 }];
  while (stack.length) {
    const { parent, depth } = stack.pop() as { parent: Parent; depth: number };
    const deep = depth >= MAX_MARKDOWN_DEPTH;
    const children: RootContent[] = [];
    for (const child of parent.children as RootContent[]) {
      if (deep && FLATTENED.has(child.type)) {
        warnings.add('content-left-out', 'nesting');
        children.push(...flatBlocks(child));
      } else if (deep && FORMATS.has(child.type)) {
        warnings.add('content-left-out', 'nesting');
        children.push({ type: 'text', value: textOf(child) });
      } else children.push(child);
    }
    parent.children = children as Parent['children'];
    for (const child of children)
      if ('children' in child) stack.push({ parent: child, depth: depth + 1 });
  }
  return tree;
}
