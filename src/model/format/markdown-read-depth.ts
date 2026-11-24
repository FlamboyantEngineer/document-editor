// Markdown nested deeper than a document holds, flattened after it is read: a quote, list or list
// item past the depth gives its blocks to the block it is in. The walk keeps its own stack, so no
// depth of nesting runs out of call stack. markdown-it itself stops nesting past its own limit,
// reading what is deeper as text.

import type { Token } from 'markdown-it';
import type { ImportWarnings } from '../../import/import-warnings.js';
import type { StoredNode } from './document-format.js';

/** The deepest nesting read as it is written. */
export const MAX_MARKDOWN_DEPTH = 32;

const FLATTENED = new Set(['blockquote', 'bulletList', 'orderedList', 'listItem']);

// The blocks a nested quote, list or item gives to the block it is in, without recursion.
function flatBlocks(node: StoredNode): StoredNode[] {
  const out: StoredNode[] = [];
  const stack: StoredNode[] = [node];
  while (stack.length) {
    const next = stack.pop() as StoredNode;
    if (FLATTENED.has(next.type)) {
      const content = next.content ?? [];
      for (let at = content.length - 1; at >= 0; at -= 1) stack.push(content[at] as StoredNode);
    } else out.push(next);
  }
  return out;
}

/** The blocks with nesting past `MAX_MARKDOWN_DEPTH` flattened, each with a warning. */
export function flattenDeepNesting(blocks: StoredNode[], warnings: ImportWarnings): StoredNode[] {
  const root: StoredNode = { type: 'doc', content: blocks };
  const stack: { parent: StoredNode; depth: number }[] = [{ parent: root, depth: 0 }];
  while (stack.length) {
    const { parent, depth } = stack.pop() as { parent: StoredNode; depth: number };
    if (!parent.content) continue;
    const deep = depth >= MAX_MARKDOWN_DEPTH;
    const content = parent.content.flatMap((child) => {
      if (!deep || !FLATTENED.has(child.type)) return [child];
      warnings.add('content-left-out', 'nesting');
      return flatBlocks(child);
    });
    (parent as { content: StoredNode[] }).content = content;
    for (const child of content)
      if (FLATTENED.has(child.type)) stack.push({ parent: child, depth: depth + 1 });
  }
  return root.content ?? [];
}

const NESTING_TOKENS = new Set([
  'blockquote_open',
  'bullet_list_open',
  'ordered_list_open',
  'list_item_open',
]);

/** Whether markdown-it tokens nest quotes, lists or items deeper than `MAX_MARKDOWN_DEPTH`. */
export function deeperThanStored(tokens: readonly Token[]): boolean {
  let depth = 0;
  for (const token of tokens) {
    if (NESTING_TOKENS.has(token.type)) depth += 1;
    else if (NESTING_TOKENS.has(token.type.replace(/_close$/, '_open'))) depth -= 1;
    if (depth > MAX_MARKDOWN_DEPTH) return true;
  }
  return false;
}
