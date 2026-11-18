// A captioned object's caption: a figure's caption is its content, a table's the caption before
// it in its `table_figure`, and a code block's its caption attribute. The stored format keeps a
// figure's or table's caption as its first child, of type `caption`.

import type { Attrs, Node as ProseMirrorNode, Schema } from 'prosemirror-model';
import type { StoredNode } from '../format/document-format.js';
import { normalizeCaptionText } from './caption-text.js';

const CAPTION_TYPES = new Set(['figure_caption', 'table_caption']);

/** Whether a node is a figure's or a table's caption. */
export const isCaptionNode = (node: ProseMirrorNode | null | undefined): boolean =>
  Boolean(node && CAPTION_TYPES.has(node.type.name));

/**
 * The caption node of a figure, of a `table_figure`, or of a table given with its parent; null for
 * any other node, and for a code block, whose caption is an attribute.
 */
export function captionNodeOf(
  node: ProseMirrorNode,
  parent?: ProseMirrorNode | null,
): ProseMirrorNode | null {
  const name = node.type.name;
  const holder = name === 'table' ? parent : node;
  if (name !== 'figure' && name !== 'table_figure' && name !== 'table') return null;
  const first = holder?.firstChild;
  return first && CAPTION_TYPES.has(first.type.name) ? first : null;
}

/** A captioned object's caption as one line of text: its caption node's, or a code block's. */
export function captionTextOf(node: ProseMirrorNode, parent?: ProseMirrorNode | null): string {
  if (node.type.name === 'code_block') return normalizeCaptionText(node.attrs.caption);
  return normalizeCaptionText(captionNodeOf(node, parent)?.textContent ?? '');
}

/** A stored figure's or table's caption, its first child; null when it has none. */
export function storedCaptionOf(node: StoredNode): StoredNode | null {
  const first = node.content?.[0];
  return first?.type === 'caption' ? first : null;
}

/** A stored node's children after its caption: a table's rows. */
export const storedBodyOf = (node: StoredNode): StoredNode[] =>
  storedCaptionOf(node) ? (node.content ?? []).slice(1) : (node.content ?? []);

// The text of stored inline content, a footnote's own text left out.
function storedText(content: readonly StoredNode[] | undefined): string {
  return (content ?? [])
    .map((child) => {
      if (child.type === 'text') return child.text ?? '';
      if (child.type === 'footnote') return '';
      return storedText(child.content);
    })
    .join('');
}

/** A stored captioned object's caption as one line of text: its caption's, or a code block's. */
export function storedCaptionText(node: StoredNode): string {
  if (node.type === 'codeBlock') return normalizeCaptionText(node.attrs?.caption);
  return normalizeCaptionText(storedText(storedCaptionOf(node)?.content));
}

/** A stored caption holding one line of text, as a figure's or a table's first child. */
export function storedCaption(text: string): StoredNode {
  const line = normalizeCaptionText(text);
  return line ? { type: 'caption', content: [{ type: 'text', text: line }] } : { type: 'caption' };
}

// A caption node of a type holding one line of text, or empty.
function captionOf(schema: Schema, name: 'figure_caption' | 'table_caption', text: string) {
  const line = normalizeCaptionText(text);
  return schema.nodes[name]?.create(null, line ? schema.text(line) : null) ?? null;
}

/** A new figure with its attributes and a caption of one line of text, empty by default. */
export function createFigure(
  schema: Schema,
  attrs: Attrs | null,
  caption = '',
): ProseMirrorNode | null {
  const content = captionOf(schema, 'figure_caption', caption);
  return content ? (schema.nodes.figure?.create(attrs, content) ?? null) : null;
}

/** A table with its caption of one line of text, empty by default, in the node holding both. */
export function createTableFigure(
  schema: Schema,
  table: ProseMirrorNode,
  caption = '',
): ProseMirrorNode | null {
  const line = captionOf(schema, 'table_caption', caption);
  return line ? (schema.nodes.table_figure?.create(null, [line, table]) ?? null) : null;
}
