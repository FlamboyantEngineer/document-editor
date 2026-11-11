// A template's content as a document holds it: its stored content, with each `{{key}}` token in
// its text a live variable, and a paragraph that is only a list token, such as
// `{{table_of_contents}}`, a list of contents of its kind.

import { Fragment, type Node as ProseMirrorNode, type Schema } from 'prosemirror-model';
import { readStoredContent } from '../format/document-format-convert.js';

const TOKEN = /\{\{\s*([A-Za-z][\w.-]*)\s*\}\}/g;

/** The list tokens a paragraph may be, and the kind of contents each is. */
export const CONTENTS_TOKENS: Readonly<Record<string, string>> = {
  table_of_contents: 'toc',
  list_of_figures: 'figures',
  list_of_tables: 'tables',
  list_of_code: 'codeBlocks',
  list_of_equations: 'equations',
};

// A text node with its tokens as variables beside the text around them.
function expandText(node: ProseMirrorNode, schema: Schema): ProseMirrorNode[] {
  const variable = schema.nodes.template_variable;
  const text = node.text ?? '';
  if (!variable || !TOKEN.test(text)) return [node];
  TOKEN.lastIndex = 0;
  const parts: ProseMirrorNode[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const at = match.index ?? 0;
    if (at > last) parts.push(schema.text(text.slice(last, at), node.marks));
    parts.push(variable.create({ variableKey: match[1] ?? '' }));
    last = at + match[0].length;
  }
  if (last < text.length) parts.push(schema.text(text.slice(last), node.marks));
  return parts;
}

// A node with the tokens of its text expanded, or a list of contents for a list token.
function expand(node: ProseMirrorNode, schema: Schema): ProseMirrorNode {
  const toc = schema.nodes.toc_block;
  const only =
    node.type.name === 'paragraph' ? /^\{\{\s*(\w+)\s*\}\}$/.exec(node.textContent.trim()) : null;
  const kind = only ? CONTENTS_TOKENS[only[1] ?? ''] : undefined;
  if (toc && kind && node.childCount === 1) return toc.create({ tocType: kind });
  if (node.isText || node.isLeaf) return node;
  const children: ProseMirrorNode[] = [];
  node.forEach((child) => {
    if (child.isText) children.push(...expandText(child, schema));
    else children.push(expand(child, schema));
  });
  return node.copy(Fragment.fromArray(children));
}

/** A template's stored content as a document holds it, its tokens live. */
export function readTemplateContent(content: unknown, schema: Schema): ProseMirrorNode[] {
  return readStoredContent(content, schema).map((node) => expand(node, schema));
}
